import { getConfig } from '@expo/config';
import { Flags } from '@oclif/core';
import assert from 'assert';
import chalk from 'chalk';

import EasCommand from '../../commandUtils/EasCommand';
import { AppleDeviceQuery } from '../../credentials/ios/api/graphql/queries/AppleDeviceQuery';
import { AppleTeamQuery } from '../../credentials/ios/api/graphql/queries/AppleTeamQuery';
import formatDevice from '../../devices/utils/formatDevice';
import Log from '../../log';
import { Ora, ora } from '../../ora';
import { findProjectRootAsync, getProjectAccountNameAsync } from '../../project/projectUtils';
import { promptAsync } from '../../prompts';

export default class BuildList extends EasCommand {
  static description = 'list all registered devices for your account';

  static flags = {
    'apple-team-id': Flags.string(),
  };

  async runAsync(): Promise<void> {
    let appleTeamIdentifier = (await this.parse(BuildList)).flags['apple-team-id'];

    const projectDir = await findProjectRootAsync();
    const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
    const accountName = await getProjectAccountNameAsync(exp);

    let spinner: Ora;

    if (!appleTeamIdentifier) {
      spinner = ora().start('Fetching the list of teams for the project…');

      try {
        const teams = await AppleTeamQuery.getAllForAccountAsync(accountName);

        if (teams.length) {
          spinner.succeed();

          if (teams.length === 1) {
            appleTeamIdentifier = teams[0].appleTeamIdentifier;
          } else {
            const result = await promptAsync({
              type: 'select',
              name: 'appleTeamIdentifier',
              message: 'What Apple Team would you like to list devices for?',
              choices: teams.map(team => ({
                title: team.appleTeamName
                  ? `${team.appleTeamName} (ID: ${team.appleTeamIdentifier})`
                  : team.appleTeamIdentifier,
                value: team.appleTeamIdentifier,
              })),
            });

            appleTeamIdentifier = result.appleTeamIdentifier;
          }
        } else {
          spinner.fail(`Couldn't find any teams for the account ${accountName}`);
        }
      } catch (e) {
        spinner.fail(`Something went wrong and we couldn't fetch the list of teams`);
        throw e;
      }
    }

    assert(appleTeamIdentifier, 'No team identifier is specified');

    spinner = ora().start('Fetching the list of devices for the team…');

    try {
      const result = await AppleDeviceQuery.getAllForAppleTeamAsync(
        accountName,
        appleTeamIdentifier
      );

      if (result?.appleDevices.length) {
        const { appleTeamName, appleDevices } = result;

        spinner.succeed(
          `Found ${appleDevices.length} devices for team ${appleTeamName ?? appleTeamIdentifier}`
        );

        const list = appleDevices
          .map(device =>
            formatDevice(device, { appleTeamName, appleTeamIdentifier: appleTeamIdentifier! })
          )
          .join(`\n\n${chalk.dim('———')}\n\n`);

        Log.log(`\n${list}`);
      } else {
        spinner.fail(`Couldn't find any devices for the team ${appleTeamIdentifier}`);
      }
    } catch (e) {
      spinner.fail(`Something went wrong and we couldn't fetch the device list`);
      throw e;
    }
  }
}
