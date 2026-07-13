import { ConfigPlugin, withXcodeProject } from '@expo/config-plugins';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
 
type PluginProps = {
  enableMediaProjectionService?: boolean;
  enableVideoEffects?: boolean;
  appleTeamId?: string;
};
 
const NATIVE_FILES = [
  'ShowVideoEffectsBridge.swift',
  'ShowVideoEffectsBridge.m',
];
 
function copyNativeFiles(projectRoot: string, iosProjectName: string) {
  const nativeSrcPath = path.join(projectRoot, 'node_modules/@apirtc/expo-apirtc-options-plugin/build/static');
  const iosPath = path.join(projectRoot, 'ios', iosProjectName);
 
  for (const file of NATIVE_FILES) {
    const src = path.join(nativeSrcPath, file);
    const dest = path.join(iosPath, file);
 
    if (!fs.existsSync(src)) {
      logger.warn(`File not found: ${src}`);
      continue;
    }
 
    fs.copyFileSync(src, dest);
    logger.info(`Copied: ${file}`);
  }
}
 
const withVideoEffectsBridge: ConfigPlugin<PluginProps> = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const iosProjectName = config.modRequest.projectName!;
    const iosDir = path.join(projectRoot, 'ios');
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
 
    copyNativeFiles(projectRoot, iosProjectName);
 
    // Find the Sources section (PBXSourcesBuildPhase) of the main app target
    const buildPhases = project.hash.project.objects['PBXSourcesBuildPhase'];
    const buildPhaseEntry = Object.entries(buildPhases).find(
      ([key, val]: [string, any]) =>
        key !== 'isa' && val?.isa === 'PBXSourcesBuildPhase'
    );
    if (!buildPhaseEntry) {
      throw new Error('PBXSourcesBuildPhase not found in Xcode project.');
    }
 
    const [, sourcesBuildPhase] = buildPhaseEntry;
    (sourcesBuildPhase as any).files = (sourcesBuildPhase as any).files || [];
 
    for (const fileName of NATIVE_FILES) {
      const filePath = path.join(iosDir, iosProjectName, fileName);
 
      if (!fs.existsSync(filePath)) {
        logger.warn(`Native file not found: ${filePath}`);
        continue;
      }
 
      const file = project.addFile(
        path.join(iosProjectName, fileName),
        mainGroup
      );
 
      if (!file?.fileRef) {
        logger.warn(`Failed to add: ${fileName}`);
        continue;
      }
 
      const alreadyExists = (sourcesBuildPhase as any).files.some(
        (f: any) => f?.comment === `${fileName} in Sources`
      );
      if (alreadyExists) continue;
 
      const buildFileUuid = project.generateUuid();
      project.hash.project.objects['PBXBuildFile'][buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: file.fileRef,
      };
 
      (sourcesBuildPhase as any).files.push({
        value: buildFileUuid,
        comment: `${fileName} in Sources`,
      });
 
      logger.info(`File added: ${fileName}`);
    }
 
    // Swift config on the main target (no bridging header needed:
    // RCT_EXTERN_MODULE links via Obj-C runtime, not a generated header)
    const targetUuid = project.getFirstTarget().uuid;
    project.addBuildProperty('SWIFT_VERSION', '5.0', targetUuid);
 
    return config;
  });
};
 
export default withVideoEffectsBridge;