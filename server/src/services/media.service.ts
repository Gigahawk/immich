import { Inject, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { StorageCore, StorageFolder } from 'src/cores/storage.core';
import { SystemConfigCore } from 'src/cores/system-config.core';
import { SystemConfigFFmpegDto } from 'src/dtos/system-config-ffmpeg.dto';
import { AssetEntity, AssetType } from 'src/entities/asset.entity';
import { AssetPathType } from 'src/entities/move.entity';
import {
  AudioCodec,
  Colorspace,
  TranscodeHWAccel,
  TranscodePolicy,
  TranscodeTarget,
  VideoCodec,
} from 'src/entities/system-config.entity';
import { IAssetRepository, WithoutProperty } from 'src/interfaces/asset.repository';
import { ICryptoRepository } from 'src/interfaces/crypto.repository';
import {
  IBaseJob,
  IEntityJob,
  IJobRepository,
  JOBS_ASSET_PAGINATION_SIZE,
  JobItem,
  JobName,
  JobStatus,
  QueueName,
} from 'src/interfaces/job.repository';
import {
  AudioStreamInfo,
  IMediaRepository,
  VideoCodecHWConfig,
  VideoStreamInfo,
} from 'src/interfaces/media.repository';
import { IMoveRepository } from 'src/interfaces/move.repository';
import { IPersonRepository } from 'src/interfaces/person.repository';
import { IStorageRepository } from 'src/interfaces/storage.repository';
import { ISystemConfigRepository } from 'src/interfaces/system-config.repository';
import { ImmichLogger } from 'src/utils/logger';
import {
  H264Config,
  HEVCConfig,
  NVENCConfig,
  QSVConfig,
  RKMPPConfig,
  ThumbnailConfig,
  VAAPIConfig,
  VP9Config,
} from 'src/utils/media';
import { usePagination } from 'src/utils/pagination';

@Injectable()
export class MediaService {
  private logger = new ImmichLogger(MediaService.name);
  private configCore: SystemConfigCore;
  private storageCore: StorageCore;
  private hasOpenCL?: boolean = undefined;

  constructor(
    @Inject(IAssetRepository) private assetRepository: IAssetRepository,
    @Inject(IPersonRepository) private personRepository: IPersonRepository,
    @Inject(IJobRepository) private jobRepository: IJobRepository,
    @Inject(IMediaRepository) private mediaRepository: IMediaRepository,
    @Inject(IStorageRepository) private storageRepository: IStorageRepository,
    @Inject(ISystemConfigRepository) configRepository: ISystemConfigRepository,
    @Inject(IMoveRepository) moveRepository: IMoveRepository,
    @Inject(ICryptoRepository) cryptoRepository: ICryptoRepository,
  ) {
    this.configCore = SystemConfigCore.create(configRepository);
    this.storageCore = StorageCore.create(
      assetRepository,
      moveRepository,
      personRepository,
      cryptoRepository,
      configRepository,
      storageRepository,
    );
  }

  async handleQueueGenerateThumbnails({ force }: IBaseJob): Promise<JobStatus> {
    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) => {
      return force
        ? this.assetRepository.getAll(pagination)
        : this.assetRepository.getWithout(pagination, WithoutProperty.THUMBNAIL);
    });

    for await (const assets of assetPagination) {
      const jobs: JobItem[] = [];

      for (const asset of assets) {
        if (!asset.resizePath || force) {
          jobs.push({ name: JobName.GENERATE_JPEG_THUMBNAIL, data: { id: asset.id } });
          continue;
        }
        if (!asset.webpPath) {
          jobs.push({ name: JobName.GENERATE_WEBP_THUMBNAIL, data: { id: asset.id } });
        }
        if (!asset.thumbhash) {
          jobs.push({ name: JobName.GENERATE_THUMBHASH_THUMBNAIL, data: { id: asset.id } });
        }
      }

      await this.jobRepository.queueAll(jobs);
    }

    const jobs: JobItem[] = [];
    const personPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.personRepository.getAll(pagination, { where: force ? undefined : { thumbnailPath: '' } }),
    );

    for await (const people of personPagination) {
      for (const person of people) {
        if (!person.faceAssetId) {
          const face = await this.personRepository.getRandomFace(person.id);
          if (!face) {
            continue;
          }

          await this.personRepository.update({ id: person.id, faceAssetId: face.assetId });
        }

        jobs.push({ name: JobName.GENERATE_PERSON_THUMBNAIL, data: { id: person.id } });
      }
    }

    await this.jobRepository.queueAll(jobs);

    return JobStatus.SUCCESS;
  }

  async handleQueueMigration(): Promise<JobStatus> {
    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.assetRepository.getAll(pagination),
    );

    const { active, waiting } = await this.jobRepository.getJobCounts(QueueName.MIGRATION);
    if (active === 1 && waiting === 0) {
      await this.storageCore.removeEmptyDirs(StorageFolder.THUMBNAILS);
      await this.storageCore.removeEmptyDirs(StorageFolder.ENCODED_VIDEO);
    }

    for await (const assets of assetPagination) {
      await this.jobRepository.queueAll(
        assets.map((asset) => ({ name: JobName.MIGRATE_ASSET, data: { id: asset.id } })),
      );
    }

    const personPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) =>
      this.personRepository.getAll(pagination),
    );

    for await (const people of personPagination) {
      await this.jobRepository.queueAll(
        people.map((person) => ({ name: JobName.MIGRATE_PERSON, data: { id: person.id } })),
      );
    }

    return JobStatus.SUCCESS;
  }

  async handleAssetMigration({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id]);
    if (!asset) {
      return JobStatus.FAILED;
    }

    await this.storageCore.moveAssetFile(asset, AssetPathType.JPEG_THUMBNAIL);
    await this.storageCore.moveAssetFile(asset, AssetPathType.WEBP_THUMBNAIL);
    await this.storageCore.moveAssetFile(asset, AssetPathType.ENCODED_VIDEO);

    return JobStatus.SUCCESS;
  }

  async handleGenerateJpegThumbnail({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id], { exifInfo: true });
    if (!asset) {
      return JobStatus.FAILED;
    }

    const resizePath = await this.generateThumbnail(asset, 'jpeg');
    await this.assetRepository.update({ id: asset.id, resizePath });
    return JobStatus.SUCCESS;
  }

  private async generateThumbnail(asset: AssetEntity, format: 'jpeg' | 'webp') {
    const { thumbnail, ffmpeg } = await this.configCore.getConfig();
    const size = format === 'jpeg' ? thumbnail.jpegSize : thumbnail.webpSize;
    const path =
      format === 'jpeg' ? StorageCore.getLargeThumbnailPath(asset) : StorageCore.getSmallThumbnailPath(asset);
    this.storageCore.ensureFolders(path);

    switch (asset.type) {
      case AssetType.IMAGE: {
        const colorspace = this.isSRGB(asset) ? Colorspace.SRGB : thumbnail.colorspace;
        const thumbnailOptions = { format, size, colorspace, quality: thumbnail.quality };
        await this.mediaRepository.resize(asset.originalPath, path, thumbnailOptions);
        break;
      }

      case AssetType.VIDEO: {
        const { audioStreams, videoStreams } = await this.mediaRepository.probe(asset.originalPath);
        const mainVideoStream = this.getMainStream(videoStreams);
        if (!mainVideoStream) {
          this.logger.warn(`Skipped thumbnail generation for asset ${asset.id}: no video streams found`);
          return;
        }
        const mainAudioStream = this.getMainStream(audioStreams);
        const config = { ...ffmpeg, targetResolution: size.toString() };
        const options = new ThumbnailConfig(config).getOptions(TranscodeTarget.VIDEO, mainVideoStream, mainAudioStream);
        await this.mediaRepository.transcode(asset.originalPath, path, options);
        break;
      }

      default: {
        throw new UnsupportedMediaTypeException(`Unsupported asset type for thumbnail generation: ${asset.type}`);
      }
    }
    this.logger.log(
      `Successfully generated ${format.toUpperCase()} ${asset.type.toLowerCase()} thumbnail for asset ${asset.id}`,
    );
    return path;
  }

  async handleGenerateWebpThumbnail({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id], { exifInfo: true });
    if (!asset) {
      return JobStatus.FAILED;
    }

    const webpPath = await this.generateThumbnail(asset, 'webp');
    await this.assetRepository.update({ id: asset.id, webpPath });
    return JobStatus.SUCCESS;
  }

  async handleGenerateThumbhashThumbnail({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id]);
    if (!asset?.resizePath) {
      return JobStatus.FAILED;
    }

    const thumbhash = await this.mediaRepository.generateThumbhash(asset.resizePath);
    await this.assetRepository.update({ id: asset.id, thumbhash });

    return JobStatus.SUCCESS;
  }

  async handleQueueVideoConversion(job: IBaseJob): Promise<JobStatus> {
    const { force } = job;

    const assetPagination = usePagination(JOBS_ASSET_PAGINATION_SIZE, (pagination) => {
      return force
        ? this.assetRepository.getAll(pagination, { type: AssetType.VIDEO })
        : this.assetRepository.getWithout(pagination, WithoutProperty.ENCODED_VIDEO);
    });

    for await (const assets of assetPagination) {
      await this.jobRepository.queueAll(
        assets.map((asset) => ({ name: JobName.VIDEO_CONVERSION, data: { id: asset.id } })),
      );
    }

    return JobStatus.SUCCESS;
  }

  async handleVideoConversion({ id }: IEntityJob): Promise<JobStatus> {
    const [asset] = await this.assetRepository.getByIds([id]);
    if (!asset || asset.type !== AssetType.VIDEO) {
      return JobStatus.FAILED;
    }

    const input = asset.originalPath;
    const output = StorageCore.getEncodedVideoPath(asset);
    this.storageCore.ensureFolders(output);

    const { videoStreams, audioStreams, format } = await this.mediaRepository.probe(input);
    const mainVideoStream = this.getMainStream(videoStreams);
    const mainAudioStream = this.getMainStream(audioStreams);
    const containerExtension = format.formatName;
    if (!mainVideoStream || !containerExtension) {
      return JobStatus.FAILED;
    }

    if (!mainVideoStream.height || !mainVideoStream.width) {
      this.logger.warn(`Skipped transcoding for asset ${asset.id}: no video streams found`);
      return JobStatus.FAILED;
    }

    const { ffmpeg: config } = await this.configCore.getConfig();

    const target = this.getTranscodeTarget(config, mainVideoStream, mainAudioStream);
    if (target === TranscodeTarget.NONE) {
      if (asset.encodedVideoPath) {
        this.logger.log(`Transcoded video exists for asset ${asset.id}, but is no longer required. Deleting...`);
        await this.jobRepository.queue({ name: JobName.DELETE_FILES, data: { files: [asset.encodedVideoPath] } });
        await this.assetRepository.update({ id: asset.id, encodedVideoPath: null });
      }

      return JobStatus.SKIPPED;
    }

    let transcodeOptions;
    try {
      transcodeOptions = await this.getCodecConfig(config).then((c) =>
        c.getOptions(target, mainVideoStream, mainAudioStream),
      );
    } catch (error) {
      this.logger.error(`An error occurred while configuring transcoding options: ${error}`);
      return JobStatus.FAILED;
    }

    this.logger.log(`Started encoding video ${asset.id} ${JSON.stringify(transcodeOptions)}`);
    try {
      await this.mediaRepository.transcode(input, output, transcodeOptions);
    } catch (error) {
      this.logger.error(error);
      if (config.accel !== TranscodeHWAccel.DISABLED) {
        this.logger.error(
          `Error occurred during transcoding. Retrying with ${config.accel.toUpperCase()} acceleration disabled.`,
        );
      }
      config.accel = TranscodeHWAccel.DISABLED;
      transcodeOptions = await this.getCodecConfig(config).then((c) =>
        c.getOptions(target, mainVideoStream, mainAudioStream),
      );
      await this.mediaRepository.transcode(input, output, transcodeOptions);
    }

    this.logger.log(`Successfully encoded ${asset.id}`);

    await this.assetRepository.update({ id: asset.id, encodedVideoPath: output });

    return JobStatus.SUCCESS;
  }

  private getMainStream<T extends VideoStreamInfo | AudioStreamInfo>(streams: T[]): T {
    return streams.sort((stream1, stream2) => stream2.frameCount - stream1.frameCount)[0];
  }

  private getTranscodeTarget(
    config: SystemConfigFFmpegDto,
    videoStream: VideoStreamInfo | null,
    audioStream: AudioStreamInfo | null,
  ): TranscodeTarget {
    if (videoStream == null && audioStream == null) {
      return TranscodeTarget.NONE;
    }

    const isAudioTranscodeRequired = this.isAudioTranscodeRequired(config, audioStream);
    const isVideoTranscodeRequired = this.isVideoTranscodeRequired(config, videoStream);

    if (isAudioTranscodeRequired && isVideoTranscodeRequired) {
      return TranscodeTarget.ALL;
    }

    if (isAudioTranscodeRequired) {
      return TranscodeTarget.AUDIO;
    }

    if (isVideoTranscodeRequired) {
      return TranscodeTarget.VIDEO;
    }

    return TranscodeTarget.NONE;
  }

  private isAudioTranscodeRequired(ffmpegConfig: SystemConfigFFmpegDto, stream: AudioStreamInfo | null): boolean {
    if (stream == null) {
      return false;
    }

    switch (ffmpegConfig.transcode) {
      case TranscodePolicy.DISABLED: {
        return false;
      }
      case TranscodePolicy.ALL: {
        return true;
      }
      case TranscodePolicy.REQUIRED:
      case TranscodePolicy.OPTIMAL:
      case TranscodePolicy.BITRATE: {
        return !ffmpegConfig.acceptedAudioCodecs.includes(stream.codecName as AudioCodec);
      }
      default: {
        throw new Error(`Unsupported transcode policy: ${ffmpegConfig.transcode}`);
      }
    }
  }

  private isVideoTranscodeRequired(ffmpegConfig: SystemConfigFFmpegDto, stream: VideoStreamInfo | null): boolean {
    if (stream == null) {
      return false;
    }

    const scalingEnabled = ffmpegConfig.targetResolution !== 'original';
    const targetRes = Number.parseInt(ffmpegConfig.targetResolution);
    const isLargerThanTargetRes = scalingEnabled && Math.min(stream.height, stream.width) > targetRes;
    const isLargerThanTargetBitrate = stream.bitrate > this.parseBitrateToBps(ffmpegConfig.maxBitrate);

    const isTargetVideoCodec = ffmpegConfig.acceptedVideoCodecs.includes(stream.codecName as VideoCodec);
    const isRequired = !isTargetVideoCodec || stream.isHDR;

    switch (ffmpegConfig.transcode) {
      case TranscodePolicy.DISABLED: {
        return false;
      }
      case TranscodePolicy.ALL: {
        return true;
      }
      case TranscodePolicy.REQUIRED: {
        return isRequired;
      }
      case TranscodePolicy.OPTIMAL: {
        return isRequired || isLargerThanTargetRes;
      }
      case TranscodePolicy.BITRATE: {
        return isRequired || isLargerThanTargetBitrate;
      }
      default: {
        throw new Error(`Unsupported transcode policy: ${ffmpegConfig.transcode}`);
      }
    }
  }

  async getCodecConfig(config: SystemConfigFFmpegDto) {
    if (config.accel === TranscodeHWAccel.DISABLED) {
      return this.getSWCodecConfig(config);
    }
    return this.getHWCodecConfig(config);
  }

  private getSWCodecConfig(config: SystemConfigFFmpegDto) {
    switch (config.targetVideoCodec) {
      case VideoCodec.H264: {
        return new H264Config(config);
      }
      case VideoCodec.HEVC: {
        return new HEVCConfig(config);
      }
      case VideoCodec.VP9: {
        return new VP9Config(config);
      }
      default: {
        throw new UnsupportedMediaTypeException(`Codec '${config.targetVideoCodec}' is unsupported`);
      }
    }
  }

  private async getHWCodecConfig(config: SystemConfigFFmpegDto) {
    let handler: VideoCodecHWConfig;
    let devices: string[];
    switch (config.accel) {
      case TranscodeHWAccel.NVENC: {
        handler = new NVENCConfig(config);
        break;
      }
      case TranscodeHWAccel.QSV: {
        devices = await this.storageRepository.readdir('/dev/dri');
        handler = new QSVConfig(config, devices);
        break;
      }
      case TranscodeHWAccel.VAAPI: {
        devices = await this.storageRepository.readdir('/dev/dri');
        handler = new VAAPIConfig(config, devices);
        break;
      }
      case TranscodeHWAccel.RKMPP: {
        if (this.hasOpenCL === undefined) {
          try {
            const maliIcdStat = await this.storageRepository.stat('/etc/OpenCL/vendors/mali.icd');
            const maliDeviceStat = await this.storageRepository.stat('/dev/mali0');
            this.hasOpenCL = maliIcdStat.isFile() && maliDeviceStat.isCharacterDevice();
          } catch {
            this.logger.warn('OpenCL not available for transcoding, using CPU instead.');
            this.hasOpenCL = false;
          }
        }

        devices = await this.storageRepository.readdir('/dev/dri');
        handler = new RKMPPConfig(config, devices, this.hasOpenCL);
        break;
      }
      default: {
        throw new UnsupportedMediaTypeException(`${config.accel.toUpperCase()} acceleration is unsupported`);
      }
    }
    if (!handler.getSupportedCodecs().includes(config.targetVideoCodec)) {
      throw new UnsupportedMediaTypeException(
        `${config.accel.toUpperCase()} acceleration does not support codec '${config.targetVideoCodec.toUpperCase()}'. Supported codecs: ${handler.getSupportedCodecs()}`,
      );
    }

    return handler;
  }

  isSRGB(asset: AssetEntity): boolean {
    const { colorspace, profileDescription, bitsPerSample } = asset.exifInfo ?? {};
    if (colorspace || profileDescription) {
      return [colorspace, profileDescription].some((s) => s?.toLowerCase().includes('srgb'));
    } else if (bitsPerSample) {
      // assume sRGB for 8-bit images with no color profile or colorspace metadata
      return bitsPerSample === 8;
    } else {
      // assume sRGB for images with no relevant metadata
      return true;
    }
  }

  parseBitrateToBps(bitrateString: string) {
    const bitrateValue = Number.parseInt(bitrateString);

    if (Number.isNaN(bitrateValue)) {
      return 0;
    }

    if (bitrateString.toLowerCase().endsWith('k')) {
      return bitrateValue * 1000; // Kilobits per second to bits per second
    } else if (bitrateString.toLowerCase().endsWith('m')) {
      return bitrateValue * 1_000_000; // Megabits per second to bits per second
    } else {
      return bitrateValue;
    }
  }
}
