import { ConfigPlugin, withPlugins } from '@expo/config-plugins';
import withAndroidPlugin from './withAndroidPlugin';
import withIosBroadcastExtension from './withIosBroadcastExtension';
import withIosRPKFiles from './withIosRPKFiles';
import { setLogLevel, LogLevel } from './logger';

type PluginProps = {
  enableMediaProjectionService?: boolean;
  enableVideoEffects?: boolean;
  appleTeamId?: string;
  logLevel?: LogLevel;
};

export const withPlugin: ConfigPlugin<PluginProps> = (
  config,
  props = {
    enableMediaProjectionService: true,
    enableVideoEffects: true,
    appleTeamId: process.env.EXPO_APPLE_TEAM_ID || 'APPLE_TEAM_ID_NOT_SET',
  }
) => {
  if (props.logLevel) {
    setLogLevel(props.logLevel);
  }

  config = withAndroidPlugin(config, props);

  // Adds screen-sharing capabilities and extension only if the user has enabled it
  if (props.enableMediaProjectionService) {
    config = withIosBroadcastExtension(config, props);
    config = withIosRPKFiles(config, props);
  }
  return config;
};

export default withPlugin;
