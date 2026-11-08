import { slackSettingsApi } from '@teamtrail/connector-slack';
import { apiBase } from '../../lib/apiBase';

export const slackApi = slackSettingsApi(apiBase());
