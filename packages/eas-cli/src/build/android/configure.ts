import { ExpoConfig } from '@expo/config';
import { AndroidConfig } from '@expo/config-plugins';
import { Platform, Workflow } from '@expo/eas-build-job';
import { AndroidVersionAutoIncrement, BuildProfile } from '@expo/eas-json';

import Log from '../../log';
import {
  ensureApplicationIdIsDefinedForManagedProjectAsync,
  warnIfAndroidPackageDefinedInAppConfigForBareWorkflowProject,
} from '../../project/android/applicationId';
import { resolveWorkflowAsync } from '../../project/workflow';
import { getVcsClient } from '../../vcs';
import { ConfigureContext } from '../context';
import { isExpoUpdatesInstalled } from '../utils/updates';
import { configureUpdatesAsync, syncUpdatesConfigurationAsync } from './UpdatesModule';
import { BumpStrategy, bumpVersionAsync, bumpVersionInAppJsonAsync } from './version';

export async function configureAndroidAsync(ctx: ConfigureContext): Promise<void> {
  if (!ctx.hasAndroidNativeProject) {
    await ensureApplicationIdIsDefinedForManagedProjectAsync(ctx.projectDir, ctx.exp);
    return;
  }

  warnIfAndroidPackageDefinedInAppConfigForBareWorkflowProject(ctx.projectDir, ctx.exp);

  await AndroidConfig.EasBuild.configureEasBuildAsync(ctx.projectDir);

  const easGradlePath = AndroidConfig.EasBuild.getEasBuildGradlePath(ctx.projectDir);
  await getVcsClient().trackFileAsync(easGradlePath);

  if (isExpoUpdatesInstalled(ctx.projectDir)) {
    await configureUpdatesAsync(ctx.projectDir, ctx.exp);
  }
  Log.withTick('Android project configured');
}

export async function validateAndSyncProjectConfigurationAsync({
  projectDir,
  exp,
  buildProfile,
}: {
  projectDir: string;
  exp: ExpoConfig;
  buildProfile: BuildProfile<Platform.ANDROID>;
}): Promise<void> {
  const workflow = await resolveWorkflowAsync(projectDir, Platform.ANDROID);
  const { autoIncrement } = buildProfile;
  const versionBumpStrategy = resolveVersionBumpStrategy(autoIncrement ?? false);

  if (workflow === Workflow.GENERIC) {
    if (!(await AndroidConfig.EasBuild.isEasBuildGradleConfiguredAsync(projectDir))) {
      throw new Error(
        'Project is not configured. Please run "eas build:configure" to configure the project.'
      );
    }
    if (isExpoUpdatesInstalled(projectDir)) {
      await syncUpdatesConfigurationAsync(projectDir, exp);
    }
    await bumpVersionAsync({ projectDir, exp, bumpStrategy: versionBumpStrategy });
  } else {
    await bumpVersionInAppJsonAsync({ projectDir, exp, bumpStrategy: versionBumpStrategy });
  }
}

function resolveVersionBumpStrategy(autoIncrement: AndroidVersionAutoIncrement): BumpStrategy {
  if (autoIncrement === true) {
    return BumpStrategy.VERSION_CODE;
  } else if (autoIncrement === false) {
    return BumpStrategy.NOOP;
  } else if (autoIncrement === 'versionCode') {
    return BumpStrategy.VERSION_CODE;
  } else {
    return BumpStrategy.APP_VERSION;
  }
}
