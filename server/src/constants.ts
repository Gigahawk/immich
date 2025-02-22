import { Duration } from 'luxon';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Version } from 'src/utils/version';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));
export const serverVersion = Version.fromString(version);

export const AUDIT_LOG_MAX_DURATION = Duration.fromObject({ days: 100 });
export const ONE_HOUR = Duration.fromObject({ hours: 1 });

export const envName = (process.env.NODE_ENV || 'development').toUpperCase();
export const isDev = process.env.NODE_ENV === 'development';
export const APP_MEDIA_LOCATION = process.env.IMMICH_MEDIA_LOCATION || './upload';
export const WEB_ROOT = process.env.IMMICH_WEB_ROOT || '/usr/src/app/www';

const GEODATA_ROOT_PATH = process.env.IMMICH_REVERSE_GEOCODING_ROOT || '/usr/src/resources';

export const citiesFile = 'cities500.txt';
export const geodataDatePath = join(GEODATA_ROOT_PATH, 'geodata-date.txt');
export const geodataAdmin1Path = join(GEODATA_ROOT_PATH, 'admin1CodesASCII.txt');
export const geodataAdmin2Path = join(GEODATA_ROOT_PATH, 'admin2Codes.txt');
export const geodataCities500Path = join(GEODATA_ROOT_PATH, citiesFile);

export const MOBILE_REDIRECT = 'app.immich:/';
export const LOGIN_URL = '/auth/login?autoLaunch=0';
export const IMMICH_ACCESS_COOKIE = 'immich_access_token';
export const IMMICH_IS_AUTHENTICATED = 'immich_is_authenticated';
export const IMMICH_AUTH_TYPE_COOKIE = 'immich_auth_type';
export const IMMICH_API_KEY_NAME = 'api_key';
export const IMMICH_API_KEY_HEADER = 'x-api-key';
export const IMMICH_SHARED_LINK_ACCESS_COOKIE = 'immich_shared_link_token';
export enum AuthType {
  PASSWORD = 'password',
  OAUTH = 'oauth',
}

export const FACE_THUMBNAIL_SIZE = 250;

export const supportedYearTokens = ['y', 'yy'];
export const supportedMonthTokens = ['M', 'MM', 'MMM', 'MMMM'];
export const supportedWeekTokens = ['W', 'WW'];
export const supportedDayTokens = ['d', 'dd'];
export const supportedHourTokens = ['h', 'hh', 'H', 'HH'];
export const supportedMinuteTokens = ['m', 'mm'];
export const supportedSecondTokens = ['s', 'ss', 'SSS'];
export const supportedPresetTokens = [
  '{{y}}/{{y}}-{{MM}}-{{dd}}/{{filename}}',
  '{{y}}/{{MM}}-{{dd}}/{{filename}}',
  '{{y}}/{{MMMM}}-{{dd}}/{{filename}}',
  '{{y}}/{{MM}}/{{filename}}',
  '{{y}}/{{MMM}}/{{filename}}',
  '{{y}}/{{MMMM}}/{{filename}}',
  '{{y}}/{{MM}}/{{dd}}/{{filename}}',
  '{{y}}/{{MMMM}}/{{dd}}/{{filename}}',
  '{{y}}/{{y}}-{{MM}}/{{y}}-{{MM}}-{{dd}}/{{filename}}',
  '{{y}}-{{MM}}-{{dd}}/{{filename}}',
  '{{y}}-{{MMM}}-{{dd}}/{{filename}}',
  '{{y}}-{{MMMM}}-{{dd}}/{{filename}}',
  '{{y}}/{{y}}-{{MM}}/{{filename}}',
  '{{y}}/{{y}}-{{WW}}/{{filename}}',
  '{{y}}/{{y}}-{{MM}}-{{dd}}/{{assetId}}',
  '{{y}}/{{y}}-{{MM}}/{{assetId}}',
  '{{y}}/{{y}}-{{WW}}/{{assetId}}',
  '{{album}}/{{filename}}',
];

type ModelInfo = { dimSize: number };
export const CLIP_MODEL_INFO: Record<string, ModelInfo> = {
  RN50__openai: { dimSize: 1024 },
  RN50__yfcc15m: { dimSize: 1024 },
  RN50__cc12m: { dimSize: 1024 },
  RN101__openai: { dimSize: 512 },
  RN101__yfcc15m: { dimSize: 512 },
  RN50x4__openai: { dimSize: 640 },
  RN50x16__openai: { dimSize: 768 },
  RN50x64__openai: { dimSize: 1024 },
  'ViT-B-32__openai': { dimSize: 512 },
  'ViT-B-32__laion2b_e16': { dimSize: 512 },
  'ViT-B-32__laion400m_e31': { dimSize: 512 },
  'ViT-B-32__laion400m_e32': { dimSize: 512 },
  'ViT-B-32__laion2b-s34b-b79k': { dimSize: 512 },
  'ViT-B-16__openai': { dimSize: 512 },
  'ViT-B-16__laion400m_e31': { dimSize: 512 },
  'ViT-B-16__laion400m_e32': { dimSize: 512 },
  'ViT-B-16-plus-240__laion400m_e31': { dimSize: 640 },
  'ViT-B-16-plus-240__laion400m_e32': { dimSize: 640 },
  'ViT-L-14__openai': { dimSize: 768 },
  'ViT-L-14__laion400m_e31': { dimSize: 768 },
  'ViT-L-14__laion400m_e32': { dimSize: 768 },
  'ViT-L-14__laion2b-s32b-b82k': { dimSize: 768 },
  'ViT-L-14-336__openai': { dimSize: 768 },
  'ViT-L-14-quickgelu__dfn2b': { dimSize: 768 },
  'ViT-H-14__laion2b-s32b-b79k': { dimSize: 1024 },
  'ViT-H-14-quickgelu__dfn5b': { dimSize: 1024 },
  'ViT-H-14-378-quickgelu__dfn5b': { dimSize: 1024 },
  'ViT-g-14__laion2b-s12b-b42k': { dimSize: 1024 },
  'LABSE-Vit-L-14': { dimSize: 768 },
  'XLM-Roberta-Large-Vit-B-32': { dimSize: 512 },
  'XLM-Roberta-Large-Vit-B-16Plus': { dimSize: 640 },
  'XLM-Roberta-Large-Vit-L-14': { dimSize: 768 },
  'XLM-Roberta-Large-ViT-H-14__frozen_laion5b_s13b_b90k': { dimSize: 1024 },
  'nllb-clip-base-siglip__v1': { dimSize: 768 },
  'nllb-clip-large-siglip__v1': { dimSize: 1152 },
};
