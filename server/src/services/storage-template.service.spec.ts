import { when } from 'jest-when';
import { Stats } from 'node:fs';
import { SystemConfigCore, defaults } from 'src/cores/system-config.core';
import { AssetPathType } from 'src/entities/move.entity';
import { SystemConfig, SystemConfigKey } from 'src/entities/system-config.entity';
import { IAlbumRepository } from 'src/interfaces/album.repository';
import { IAssetRepository } from 'src/interfaces/asset.repository';
import { ICryptoRepository } from 'src/interfaces/crypto.repository';
import { IDatabaseRepository } from 'src/interfaces/database.repository';
import { JobStatus } from 'src/interfaces/job.repository';
import { IMoveRepository } from 'src/interfaces/move.repository';
import { IPersonRepository } from 'src/interfaces/person.repository';
import { IStorageRepository } from 'src/interfaces/storage.repository';
import { ISystemConfigRepository } from 'src/interfaces/system-config.repository';
import { IUserRepository } from 'src/interfaces/user.repository';
import { StorageTemplateService } from 'src/services/storage-template.service';
import { assetStub } from 'test/fixtures/asset.stub';
import { userStub } from 'test/fixtures/user.stub';
import { newAlbumRepositoryMock } from 'test/repositories/album.repository.mock';
import { newAssetRepositoryMock } from 'test/repositories/asset.repository.mock';
import { newCryptoRepositoryMock } from 'test/repositories/crypto.repository.mock';
import { newDatabaseRepositoryMock } from 'test/repositories/database.repository.mock';
import { newMoveRepositoryMock } from 'test/repositories/move.repository.mock';
import { newPersonRepositoryMock } from 'test/repositories/person.repository.mock';
import { newStorageRepositoryMock } from 'test/repositories/storage.repository.mock';
import { newSystemConfigRepositoryMock } from 'test/repositories/system-config.repository.mock';
import { newUserRepositoryMock } from 'test/repositories/user.repository.mock';

describe(StorageTemplateService.name, () => {
  let sut: StorageTemplateService;
  let albumMock: jest.Mocked<IAlbumRepository>;
  let assetMock: jest.Mocked<IAssetRepository>;
  let configMock: jest.Mocked<ISystemConfigRepository>;
  let moveMock: jest.Mocked<IMoveRepository>;
  let personMock: jest.Mocked<IPersonRepository>;
  let storageMock: jest.Mocked<IStorageRepository>;
  let userMock: jest.Mocked<IUserRepository>;
  let cryptoMock: jest.Mocked<ICryptoRepository>;
  let databaseMock: jest.Mocked<IDatabaseRepository>;

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  beforeEach(() => {
    configMock = newSystemConfigRepositoryMock();
    assetMock = newAssetRepositoryMock();
    albumMock = newAlbumRepositoryMock();
    moveMock = newMoveRepositoryMock();
    personMock = newPersonRepositoryMock();
    storageMock = newStorageRepositoryMock();
    userMock = newUserRepositoryMock();
    cryptoMock = newCryptoRepositoryMock();
    databaseMock = newDatabaseRepositoryMock();

    configMock.load.mockResolvedValue([{ key: SystemConfigKey.STORAGE_TEMPLATE_ENABLED, value: true }]);

    sut = new StorageTemplateService(
      albumMock,
      assetMock,
      configMock,
      moveMock,
      personMock,
      storageMock,
      userMock,
      cryptoMock,
      databaseMock,
    );

    SystemConfigCore.create(configMock).config$.next(defaults);
  });

  describe('validate', () => {
    it('should allow valid templates', () => {
      expect(() =>
        sut.validate({
          newConfig: {
            storageTemplate: {
              template:
                '{{y}}{{M}}{{W}}{{d}}{{h}}{{m}}{{s}}{{filename}}{{ext}}{{filetype}}{{filetypefull}}{{assetId}}{{album}}',
            },
          } as SystemConfig,
          oldConfig: {} as SystemConfig,
        }),
      ).not.toThrow();
    });

    it('should fail for an invalid template', () => {
      expect(() =>
        sut.validate({
          newConfig: {
            storageTemplate: {
              template: '{{foo}}',
            },
          } as SystemConfig,
          oldConfig: {} as SystemConfig,
        }),
      ).toThrow(/Invalid storage template.*/);
    });
  });

  describe('handleMigrationSingle', () => {
    it('should skip when storage template is disabled', async () => {
      configMock.load.mockResolvedValue([{ key: SystemConfigKey.STORAGE_TEMPLATE_ENABLED, value: false }]);
      await expect(sut.handleMigrationSingle({ id: assetStub.image.id })).resolves.toBe(JobStatus.SKIPPED);
      expect(assetMock.getByIds).not.toHaveBeenCalled();
      expect(storageMock.checkFileExists).not.toHaveBeenCalled();
      expect(storageMock.rename).not.toHaveBeenCalled();
      expect(storageMock.copyFile).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalled();
      expect(moveMock.create).not.toHaveBeenCalled();
      expect(moveMock.update).not.toHaveBeenCalled();
      expect(storageMock.stat).not.toHaveBeenCalled();
    });

    it('should migrate single moving picture', async () => {
      userMock.get.mockResolvedValue(userStub.user1);
      const newMotionPicturePath = `upload/library/${userStub.user1.id}/2022/2022-06-19/${assetStub.livePhotoStillAsset.id}.mp4`;
      const newStillPicturePath = `upload/library/${userStub.user1.id}/2022/2022-06-19/${assetStub.livePhotoStillAsset.id}.jpeg`;

      when(assetMock.getByIds)
        .calledWith([assetStub.livePhotoStillAsset.id], { exifInfo: true })
        .mockResolvedValue([assetStub.livePhotoStillAsset]);

      when(assetMock.getByIds)
        .calledWith([assetStub.livePhotoMotionAsset.id], { exifInfo: true })
        .mockResolvedValue([assetStub.livePhotoMotionAsset]);

      when(moveMock.create)
        .calledWith({
          entityId: assetStub.livePhotoStillAsset.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.livePhotoStillAsset.originalPath,
          newPath: newStillPicturePath,
        })
        .mockResolvedValue({
          id: '123',
          entityId: assetStub.livePhotoStillAsset.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.livePhotoStillAsset.originalPath,
          newPath: newStillPicturePath,
        });

      when(moveMock.create)
        .calledWith({
          entityId: assetStub.livePhotoMotionAsset.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.livePhotoMotionAsset.originalPath,
          newPath: newMotionPicturePath,
        })
        .mockResolvedValue({
          id: '124',
          entityId: assetStub.livePhotoMotionAsset.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.livePhotoMotionAsset.originalPath,
          newPath: newMotionPicturePath,
        });

      await expect(sut.handleMigrationSingle({ id: assetStub.livePhotoStillAsset.id })).resolves.toBe(
        JobStatus.SUCCESS,
      );

      expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.livePhotoStillAsset.id], { exifInfo: true });
      expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.livePhotoMotionAsset.id], { exifInfo: true });
      expect(storageMock.checkFileExists).toHaveBeenCalledTimes(2);
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.livePhotoStillAsset.id,
        originalPath: newStillPicturePath,
      });
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.livePhotoMotionAsset.id,
        originalPath: newMotionPicturePath,
      });
    });
    it('should migrate previously failed move from original path when it still exists', async () => {
      userMock.get.mockResolvedValue(userStub.user1);
      const previousFailedNewPath = `upload/library/${userStub.user1.id}/2023/Feb/${assetStub.image.id}.jpg`;
      const newPath = `upload/library/${userStub.user1.id}/2023/2023-02-23/${assetStub.image.id}.jpg`;

      when(storageMock.checkFileExists).calledWith(assetStub.image.originalPath).mockResolvedValue(true);
      when(storageMock.checkFileExists).calledWith(previousFailedNewPath).mockResolvedValue(false);

      when(moveMock.getByEntity).calledWith(assetStub.image.id, AssetPathType.ORIGINAL).mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: previousFailedNewPath,
      });

      when(assetMock.getByIds)
        .calledWith([assetStub.image.id], { exifInfo: true })
        .mockResolvedValue([assetStub.image]);

      when(moveMock.update)
        .calledWith({
          id: '123',
          oldPath: assetStub.image.originalPath,
          newPath,
        })
        .mockResolvedValue({
          id: '123',
          entityId: assetStub.image.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.image.originalPath,
          newPath,
        });

      await expect(sut.handleMigrationSingle({ id: assetStub.image.id })).resolves.toBe(JobStatus.SUCCESS);

      expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.image.id], { exifInfo: true });
      expect(storageMock.checkFileExists).toHaveBeenCalledTimes(3);
      expect(storageMock.rename).toHaveBeenCalledWith(assetStub.image.originalPath, newPath);
      expect(moveMock.update).toHaveBeenCalledWith({
        id: '123',
        oldPath: assetStub.image.originalPath,
        newPath,
      });
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: newPath,
      });
    });
    it('should migrate previously failed move from previous new path when old path no longer exists, should validate file size still matches before moving', async () => {
      userMock.get.mockResolvedValue(userStub.user1);
      const previousFailedNewPath = `upload/library/${userStub.user1.id}/2023/Feb/${assetStub.image.id}.jpg`;
      const newPath = `upload/library/${userStub.user1.id}/2023/2023-02-23/${assetStub.image.id}.jpg`;

      when(storageMock.checkFileExists).calledWith(assetStub.image.originalPath).mockResolvedValue(false);
      when(storageMock.checkFileExists).calledWith(previousFailedNewPath).mockResolvedValue(true);
      when(storageMock.stat)
        .calledWith(previousFailedNewPath)
        .mockResolvedValue({ size: 5000 } as Stats);
      when(cryptoMock.hashFile).calledWith(previousFailedNewPath).mockResolvedValue(assetStub.image.checksum);

      when(moveMock.getByEntity).calledWith(assetStub.image.id, AssetPathType.ORIGINAL).mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: previousFailedNewPath,
      });

      when(assetMock.getByIds)
        .calledWith([assetStub.image.id], { exifInfo: true })
        .mockResolvedValue([assetStub.image]);

      when(moveMock.update)
        .calledWith({
          id: '123',
          oldPath: previousFailedNewPath,
          newPath,
        })
        .mockResolvedValue({
          id: '123',
          entityId: assetStub.image.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: previousFailedNewPath,
          newPath,
        });

      await expect(sut.handleMigrationSingle({ id: assetStub.image.id })).resolves.toBe(JobStatus.SUCCESS);

      expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.image.id], { exifInfo: true });
      expect(storageMock.checkFileExists).toHaveBeenCalledTimes(3);
      expect(storageMock.stat).toHaveBeenCalledWith(previousFailedNewPath);
      expect(storageMock.rename).toHaveBeenCalledWith(previousFailedNewPath, newPath);
      expect(storageMock.copyFile).not.toHaveBeenCalled();
      expect(moveMock.update).toHaveBeenCalledWith({
        id: '123',
        oldPath: previousFailedNewPath,
        newPath,
      });
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: newPath,
      });
    });

    it('should fail move if copying and hash of asset and the new file do not match', async () => {
      userMock.get.mockResolvedValue(userStub.user1);
      const newPath = `upload/library/${userStub.user1.id}/2023/2023-02-23/${assetStub.image.id}.jpg`;

      when(storageMock.rename).calledWith(assetStub.image.originalPath, newPath).mockRejectedValue({ code: 'EXDEV' });
      when(storageMock.stat)
        .calledWith(newPath)
        .mockResolvedValue({ size: 5000 } as Stats);
      when(cryptoMock.hashFile).calledWith(newPath).mockResolvedValue(Buffer.from('different-hash', 'utf8'));

      when(assetMock.getByIds)
        .calledWith([assetStub.image.id], { exifInfo: true })
        .mockResolvedValue([assetStub.image]);

      when(moveMock.create)
        .calledWith({
          entityId: assetStub.image.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.image.originalPath,
          newPath: newPath,
        })
        .mockResolvedValue({
          id: '123',
          entityId: assetStub.image.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.image.originalPath,
          newPath,
        });

      await expect(sut.handleMigrationSingle({ id: assetStub.image.id })).resolves.toBe(JobStatus.SUCCESS);

      expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.image.id], { exifInfo: true });
      expect(storageMock.checkFileExists).toHaveBeenCalledTimes(1);
      expect(storageMock.stat).toHaveBeenCalledWith(newPath);
      expect(moveMock.create).toHaveBeenCalledWith({
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: newPath,
      });
      expect(storageMock.rename).toHaveBeenCalledWith(assetStub.image.originalPath, newPath);
      expect(storageMock.copyFile).toHaveBeenCalledWith(assetStub.image.originalPath, newPath);
      expect(storageMock.unlink).toHaveBeenCalledWith(newPath);
      expect(storageMock.unlink).toHaveBeenCalledTimes(1);
      expect(assetMock.update).not.toHaveBeenCalled();
    });

    it.each`
      failedPathChecksum                     | failedPathSize                              | reason
      ${assetStub.image.checksum}            | ${500}                                      | ${'file size'}
      ${Buffer.from('bad checksum', 'utf8')} | ${assetStub.image.exifInfo?.fileSizeInByte} | ${'checksum'}
    `(
      'should fail to migrate previously failed move from previous new path when old path no longer exists if $reason validation fails',
      async ({ failedPathChecksum, failedPathSize }) => {
        userMock.get.mockResolvedValue(userStub.user1);
        const previousFailedNewPath = `upload/library/${userStub.user1.id}/2023/Feb/${assetStub.image.id}.jpg`;
        const newPath = `upload/library/${userStub.user1.id}/2023/2023-02-23/${assetStub.image.id}.jpg`;

        when(storageMock.checkFileExists).calledWith(assetStub.image.originalPath).mockResolvedValue(false);
        when(storageMock.checkFileExists).calledWith(previousFailedNewPath).mockResolvedValue(true);
        when(storageMock.stat)
          .calledWith(previousFailedNewPath)
          .mockResolvedValue({ size: failedPathSize } as Stats);
        when(cryptoMock.hashFile).calledWith(previousFailedNewPath).mockResolvedValue(failedPathChecksum);

        when(moveMock.getByEntity).calledWith(assetStub.image.id, AssetPathType.ORIGINAL).mockResolvedValue({
          id: '123',
          entityId: assetStub.image.id,
          pathType: AssetPathType.ORIGINAL,
          oldPath: assetStub.image.originalPath,
          newPath: previousFailedNewPath,
        });

        when(assetMock.getByIds)
          .calledWith([assetStub.image.id], { exifInfo: true })
          .mockResolvedValue([assetStub.image]);

        when(moveMock.update)
          .calledWith({
            id: '123',
            oldPath: previousFailedNewPath,
            newPath,
          })
          .mockResolvedValue({
            id: '123',
            entityId: assetStub.image.id,
            pathType: AssetPathType.ORIGINAL,
            oldPath: previousFailedNewPath,
            newPath,
          });

        await expect(sut.handleMigrationSingle({ id: assetStub.image.id })).resolves.toBe(JobStatus.SUCCESS);

        expect(assetMock.getByIds).toHaveBeenCalledWith([assetStub.image.id], { exifInfo: true });
        expect(storageMock.checkFileExists).toHaveBeenCalledTimes(3);
        expect(storageMock.stat).toHaveBeenCalledWith(previousFailedNewPath);
        expect(storageMock.rename).not.toHaveBeenCalled();
        expect(storageMock.copyFile).not.toHaveBeenCalled();
        expect(moveMock.update).not.toHaveBeenCalled();
        expect(assetMock.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('handle template migration', () => {
    it('should handle no assets', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([]);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
    });

    it('should handle an asset with a duplicate destination', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.user1]);
      moveMock.create.mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: 'upload/library/user-id/2023/2023-02-23/asset-id+1.jpg',
      });

      when(storageMock.checkFileExists)
        .calledWith('upload/library/user-id/2023/2023-02-23/asset-id.jpg')
        .mockResolvedValue(true);

      when(storageMock.checkFileExists)
        .calledWith('upload/library/user-id/2023/2023-02-23/asset-id+1.jpg')
        .mockResolvedValue(false);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.checkFileExists).toHaveBeenCalledTimes(2);
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: 'upload/library/user-id/2023/2023-02-23/asset-id+1.jpg',
      });
      expect(userMock.getList).toHaveBeenCalled();
    });

    it('should skip when an asset already matches the template', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [
          {
            ...assetStub.image,
            originalPath: 'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
          },
        ],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.user1]);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).not.toHaveBeenCalled();
      expect(storageMock.copyFile).not.toHaveBeenCalled();
      expect(storageMock.checkFileExists).not.toHaveBeenCalledTimes(2);
      expect(assetMock.update).not.toHaveBeenCalled();
    });

    it('should skip when an asset is probably a duplicate', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [
          {
            ...assetStub.image,
            originalPath: 'upload/library/user-id/2023/2023-02-23/asset-id+1.jpg',
          },
        ],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.user1]);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).not.toHaveBeenCalled();
      expect(storageMock.copyFile).not.toHaveBeenCalled();
      expect(storageMock.checkFileExists).not.toHaveBeenCalledTimes(2);
      expect(assetMock.update).not.toHaveBeenCalled();
    });

    it('should move an asset', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.user1]);
      moveMock.create.mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: 'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      });

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      );
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: 'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      });
    });

    it('should use the user storage label', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.storageLabel]);
      moveMock.create.mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: 'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      });

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/library/label-1/2023/2023-02-23/asset-id.jpg',
      );
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: 'upload/library/label-1/2023/2023-02-23/asset-id.jpg',
      });
    });

    it('should copy the file if rename fails due to EXDEV (rename across filesystems)', async () => {
      const newPath = 'upload/library/user-id/2023/2023-02-23/asset-id.jpg';
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      storageMock.rename.mockRejectedValue({ code: 'EXDEV' });
      userMock.getList.mockResolvedValue([userStub.user1]);
      moveMock.create.mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath,
      });
      when(storageMock.stat)
        .calledWith(newPath)
        .mockResolvedValue({
          size: 5000,
        } as Stats);
      when(storageMock.stat)
        .calledWith(assetStub.image.originalPath)
        .mockResolvedValue({
          atime: new Date(),
          mtime: new Date(),
        } as Stats);
      when(cryptoMock.hashFile).calledWith(newPath).mockResolvedValue(assetStub.image.checksum);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).toHaveBeenCalledWith('/original/path.jpg', newPath);
      expect(storageMock.copyFile).toHaveBeenCalledWith('/original/path.jpg', newPath);
      expect(storageMock.stat).toHaveBeenCalledWith(newPath);
      expect(storageMock.stat).toHaveBeenCalledWith(assetStub.image.originalPath);
      expect(storageMock.utimes).toHaveBeenCalledWith(newPath, expect.any(Date), expect.any(Date));
      expect(storageMock.unlink).toHaveBeenCalledWith(assetStub.image.originalPath);
      expect(storageMock.unlink).toHaveBeenCalledTimes(1);
      expect(assetMock.update).toHaveBeenCalledWith({
        id: assetStub.image.id,
        originalPath: newPath,
      });
    });

    it('should not update the database if the move fails due to incorrect newPath filesize', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      storageMock.rename.mockRejectedValue({ code: 'EXDEV' });
      userMock.getList.mockResolvedValue([userStub.user1]);
      moveMock.create.mockResolvedValue({
        id: '123',
        entityId: assetStub.image.id,
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: 'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      });
      when(storageMock.stat)
        .calledWith('upload/library/user-id/2023/2023-02-23/asset-id.jpg')
        .mockResolvedValue({
          size: 100,
        } as Stats);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      );
      expect(storageMock.copyFile).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      );
      expect(storageMock.stat).toHaveBeenCalledWith('upload/library/user-id/2023/2023-02-23/asset-id.jpg');
      expect(assetMock.update).not.toHaveBeenCalled();
    });

    it('should not update the database if the move fails', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [assetStub.image],
        hasNextPage: false,
      });
      storageMock.rename.mockRejectedValue(new Error('Read only system'));
      storageMock.copyFile.mockRejectedValue(new Error('Read only system'));
      moveMock.create.mockResolvedValue({
        id: 'move-123',
        entityId: '123',
        pathType: AssetPathType.ORIGINAL,
        oldPath: assetStub.image.originalPath,
        newPath: '',
      });
      userMock.getList.mockResolvedValue([userStub.user1]);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).toHaveBeenCalledWith(
        '/original/path.jpg',
        'upload/library/user-id/2023/2023-02-23/asset-id.jpg',
      );
      expect(assetMock.update).not.toHaveBeenCalled();
    });

    it('should not move read-only asset', async () => {
      assetMock.getAll.mockResolvedValue({
        items: [
          {
            ...assetStub.image,
            originalPath: 'upload/library/user-id/2023/2023-02-23/asset-id+1.jpg',
            isReadOnly: true,
          },
        ],
        hasNextPage: false,
      });
      userMock.getList.mockResolvedValue([userStub.user1]);

      await sut.handleMigration();

      expect(assetMock.getAll).toHaveBeenCalled();
      expect(storageMock.rename).not.toHaveBeenCalled();
      expect(storageMock.copyFile).not.toHaveBeenCalled();
      expect(assetMock.update).not.toHaveBeenCalled();
    });
  });
});
