import { ConfigPlugin, withAndroidManifest, withMainApplication, withMainActivity, withAppBuildGradle } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

type PluginProps = {
  enableMediaProjectionService?: boolean;
  enableVideoEffects?: boolean;
};

const REQUIRED_PERMISSIONS = [
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.CAMERA",
  "android.permission.INTERNET",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.WAKE_LOCK",
  "android.permission.BLUETOOTH",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_CAMERA"
];

const MLKIT_SEGMENTATION_DEP = 'implementation("com.google.mlkit:segmentation-selfie:16.0.0-beta6")';

function getAndroidPackagePath(projectRoot: string, packageNameHint?: string): string {
  let packageName: string | undefined = packageNameHint;

  // Fallback: read from AndroidManifest.xml
  if (!packageName) {
    const manifestPath = path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const match = manifestContent.match(/package="([\w.]+)"/);
      if (match) {
        packageName = match[1];
      }
    }
  }

  // Fallback: read from app.config.ts or app.config.js
  if (!packageName) {
    const configFiles = ['app.config.ts', 'app.config.js'];
    for (const configFile of configFiles) {
      const configPath = path.join(projectRoot, configFile);
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        // Match android.package in various forms:
        // - package: "com.example.app"
        // - package: 'com.example.app'
        // - "package": "com.example.app"
        const match = configContent.match(/["']?package["']?\s*[:=]\s*["']([\w.]+)["']/);
        if (match) {
          packageName = match[1];
          break;
        }
      }
    }
  }

  // Fallback: read from app.json
  if (!packageName) {
    const appJsonPath = path.join(projectRoot, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      packageName = appJson?.expo?.android?.package;
    }
  }

  if (!packageName) {
    throw new Error('Package name not found in config.android.package, AndroidManifest.xml, app.config.ts, app.config.js or app.json');
  }

  return path.join(projectRoot, 'android/app/src/main/java', ...packageName.split('.'));
}

function getPackageName(projectRoot: string, packageNameHint?: string): string {
  return getAndroidPackagePath(projectRoot, packageNameHint)
    .replace(path.join(projectRoot, 'android/app/src/main/java') + path.sep, '')
    .split(path.sep)
    .join('.');
}

function copyAndPatchJavaFiles(projectRoot: string) {
  const srcDir = path.join(__dirname, 'static/java');
  const destDir = getAndroidPackagePath(projectRoot);

  const packageName = destDir
    .replace(path.join(projectRoot, 'android/app/src/main/java') + path.sep, '')
    .split(path.sep)
    .join('.');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  ['AppLifecycleModule.java', 'AppLifecyclePackage.java'].forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf8');
      content = content.replace(/^package\s+[\w.]+;/m, `package ${packageName};`);
      fs.writeFileSync(dest, content, 'utf8');
      logger.info(`Copied and patched ${file} to android sources with package: ${packageName}`);
    }
  });
}

function copyAndPatchKotlinFiles(projectRoot: string) {
  const srcDir = path.join(__dirname, 'static/kotlin');
  const destDir = getAndroidPackagePath(projectRoot);

  const packageName = destDir
    .replace(path.join(projectRoot, 'android/app/src/main/java') + path.sep, '')
    .split(path.sep)
    .join('.');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const kotlinFiles = [
    'BackgroundBlurPackage.kt',
    'BackgroundBlurModule.kt',
    'BlurVideoProcessor.kt',
    'BackgroundImageProcessor.kt',
  ];

  kotlinFiles.forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf8');
      // Kotlin package declaration has no trailing semicolon
      content = content.replace(/^package\s+[\w.]+/m, `package ${packageName}`);
      fs.writeFileSync(dest, content, 'utf8');
      logger.info(`Copied and patched ${file} to android sources with package: ${packageName}`);
    } else {
      logger.warn(`Kotlin source not found: ${src}`);
    }
  });
}

const withAndroidPermissions: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    REQUIRED_PERMISSIONS.forEach((permission) => {

      logger.debug('check manifest permission:', permission);

      if (
        Array.isArray(manifest['uses-permission']) &&
        !manifest['uses-permission'].some((item: any) => item.$ && item.$['android:name'] === permission)
      ) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission }
        });
        logger.info(`Added permission: ${permission}`);
      }
    });
    return config;
  });
};

const withMlKitGradleDep: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('segmentation-selfie')) {
      config.modResults.contents = config.modResults.contents.replace(
        /(\s*dependencies\s*\{)/,
        `$1\n    ${MLKIT_SEGMENTATION_DEP}`
      );
      logger.info('Added ML Kit segmentation-selfie dependency to app/build.gradle');
    }
    return config;
  });
};

const withAndroidPlugin: ConfigPlugin<PluginProps> = (config, props) => {

  logger.info('withAndroidPlugin called with props:', props);

  let updatedConfig = withMainApplication(config, (config) => {
    const mainApplication = config.modResults;

    const packageName = (() => {
      try {
        return getPackageName(config.modRequest.projectRoot, config.android?.package ?? undefined);
      } catch {
        return null;
      }
    })();

    // Add WebRTCModuleOptions (Media Projection Service) if enabled
    if (props.enableMediaProjectionService !== false) {
      // Add WebRTCModuleOptions import
      if (!mainApplication.contents.includes('import com.oney.WebRTCModule.WebRTCModuleOptions')) {
        mainApplication.contents = mainApplication.contents.replace(
          /(package\s+[\w.]+(?:\r?\n))/,
          `$1\nimport com.oney.WebRTCModule.WebRTCModuleOptions\n`
        );
      }

      // Add WebRTCModuleOptions code at start of onCreate()
      const onCreateRegex = /override fun onCreate\(\) \{\n/;
      const customCode = [
        '    val options: WebRTCModuleOptions = WebRTCModuleOptions.getInstance()',
        '    options.enableMediaProjectionService = true\n'
      ].join('\n');

      if (!mainApplication.contents.includes('WebRTCModuleOptions.getInstance()')) {
        mainApplication.contents = mainApplication.contents.replace(
          onCreateRegex,
          match => `${match}${customCode}`
        );
      }
    } else {
      logger.info('Media Projection Service is disabled, skipping WebRTCModuleOptions modifications.');
    }

    // Add AppLifecyclePackage import and registration
    if (packageName) {
      const importLine = `import ${packageName}.AppLifecyclePackage\n`;
      if (!mainApplication.contents.includes(importLine.trim())) {
        mainApplication.contents = mainApplication.contents.replace(
          /(package\s+[\w.]+(?:\r?\n))/,
          `$1${importLine}`
        );
      }
    }

    if (!mainApplication.contents.includes('add(AppLifecyclePackage())')) {
      mainApplication.contents = mainApplication.contents.replace(
        /(\/\/ add\(MyReactNativePackage\(\)\))/,
        match => `${match}\n          add(AppLifecyclePackage())`
      );
    }

    // Add BackgroundBlurPackage if enableVideoEffects is true
    if (props.enableVideoEffects !== false) {
      if (packageName) {
        const blurImportLine = `import ${packageName}.BackgroundBlurPackage\n`;
        if (!mainApplication.contents.includes(blurImportLine.trim())) {
          mainApplication.contents = mainApplication.contents.replace(
            /(package\s+[\w.]+(?:\r?\n))/,
            `$1${blurImportLine}`
          );
        }
      }

      if (!mainApplication.contents.includes('add(BackgroundBlurPackage())')) {
        mainApplication.contents = mainApplication.contents.replace(
          /(\/\/ add\(MyReactNativePackage\(\)\))/,
          match => `${match}\n          add(BackgroundBlurPackage())`
        );
      }

      // Copy Kotlin native files
      copyAndPatchKotlinFiles(config.modRequest.projectRoot);
    }

    // Copy Java native files
    copyAndPatchJavaFiles(config.modRequest.projectRoot);

    return config;
  });

  // Add ML Kit Gradle dependency when video effects are enabled
  if (props.enableVideoEffects !== false) {
    updatedConfig = withMlKitGradleDep(updatedConfig);
  }

  updatedConfig = withAndroidPermissions(updatedConfig);

  // Fix NullPointerException in ReactActivityDelegate.onUserLeaveHint
  // This crash occurs when Media Projection permission dialog pauses the activity
  updatedConfig = withMainActivity(updatedConfig, (config) => {
    const mainActivity = config.modResults;

    if (!mainActivity.contents.includes('onUserLeaveHint')) {
      // Add the override before the closing brace of the class
      const onUserLeaveHintCode = `
  override fun onUserLeaveHint() {
    try {
      super.onUserLeaveHint()
    } catch (e: NullPointerException) {
      // Workaround for NPE in ReactActivityDelegate.onUserLeaveHint
      // when Media Projection permission dialog pauses the activity
    }
  }
`;
      mainActivity.contents = mainActivity.contents.replace(
        /\n}\s*$/,
        `${onUserLeaveHintCode}\n}`
      );
    }

    return config;
  });

  return updatedConfig;
};

export default withAndroidPlugin;
