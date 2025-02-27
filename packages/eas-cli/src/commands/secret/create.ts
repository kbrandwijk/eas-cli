import { getConfig } from '@expo/config';
import { Flags } from '@oclif/core';
import chalk from 'chalk';

import EasCommand from '../../commandUtils/EasCommand';
import { EnvironmentSecretMutation } from '../../graphql/mutations/EnvironmentSecretMutation';
import {
  EnvironmentSecretScope,
  EnvironmentSecretsQuery,
} from '../../graphql/queries/EnvironmentSecretsQuery';
import Log from '../../log';
import {
  findProjectRootAsync,
  getProjectAccountNameAsync,
  getProjectIdAsync,
} from '../../project/projectUtils';
import { promptAsync } from '../../prompts';
import { findAccountByName } from '../../user/Account';
import { getActorDisplayName } from '../../user/User';
import { ensureLoggedInAsync } from '../../user/actions';

export default class EnvironmentSecretCreate extends EasCommand {
  static description = 'Create an environment secret on the current project or owner account.';

  static flags = {
    scope: Flags.enum({
      description: 'Scope for the secret',
      options: [EnvironmentSecretScope.ACCOUNT, EnvironmentSecretScope.PROJECT],
      default: EnvironmentSecretScope.PROJECT,
    }),
    name: Flags.string({
      description: 'Name of the secret',
    }),
    value: Flags.string({
      description: 'Value of the secret',
    }),
    force: Flags.boolean({
      description: 'Delete and recreate existing secrets',
      default: false,
    }),
  };

  async runAsync(): Promise<void> {
    const actor = await ensureLoggedInAsync();
    let {
      flags: { name, value: secretValue, scope, force },
    } = await this.parse(EnvironmentSecretCreate);

    const projectDir = await findProjectRootAsync();
    const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
    const accountName = await getProjectAccountNameAsync(exp);

    const { slug } = exp;
    const projectId = await getProjectIdAsync(exp);

    if (!scope) {
      const validationMessage = 'Secret scope may not be empty.';

      ({ scope } = await promptAsync({
        type: 'select',
        name: 'scope',
        message: 'Where should this secret be used:',
        choices: [
          { title: 'Account-wide', value: EnvironmentSecretScope.ACCOUNT },
          { title: 'Project-specific', value: EnvironmentSecretScope.PROJECT },
        ],
        validate: value => (value ? true : validationMessage),
      }));
    }

    if (!name) {
      ({ name } = await promptAsync({
        type: 'text',
        name: 'name',
        message: `Secret name:`,
        validate: value => {
          if (!value) {
            return 'Secret name may not be empty.';
          }

          // this validation regex here is just to shorten the feedback loop
          // the source of truth is in www's EnvironmentSecretValidator class
          if (!value.match(/^\w+$/)) {
            return 'Names may contain only letters, numbers, and underscores.';
          }

          return true;
        },
      }));

      if (!name) {
        throw new Error('Secret name may not be empty.');
      }
    }

    if (!secretValue) {
      const validationMessage = 'Secret value may not be empty.';

      ({ secretValue } = await promptAsync({
        type: 'text',
        name: 'secretValue',
        message: 'Secret value:',
        validate: value => (value ? true : validationMessage),
      }));

      if (!secretValue) {
        throw new Error(validationMessage);
      }
    }

    if (scope === EnvironmentSecretScope.PROJECT) {
      if (force) {
        const existingSecrets = await EnvironmentSecretsQuery.byAppIdAsync(projectId);
        const existingSecret = existingSecrets.find(secret => secret.name === name);

        if (existingSecret) {
          await EnvironmentSecretMutation.deleteAsync(existingSecret.id);
          Log.withTick(
            `Deleting existing secret ${chalk.bold(name)} on project ${chalk.bold(
              `@${accountName}/${slug}`
            )}.`
          );
        }
      }

      const secret = await EnvironmentSecretMutation.createForAppAsync(
        { name, value: secretValue },
        projectId
      );
      if (!secret) {
        throw new Error(
          `Could not create secret with name ${name} on project with id ${projectId}`
        );
      }

      Log.withTick(
        `️Created a new secret ${chalk.bold(name)} on project ${chalk.bold(
          `@${accountName}/${slug}`
        )}.`
      );
    } else if (scope === EnvironmentSecretScope.ACCOUNT) {
      const ownerAccount = findAccountByName(actor.accounts, accountName);

      if (!ownerAccount) {
        Log.warn(
          `Your account (${getActorDisplayName(actor)}) doesn't have access to the ${chalk.bold(
            accountName
          )} account`
        );
        return;
      }

      if (force) {
        const existingSecrets = await EnvironmentSecretsQuery.byAccountNameAsync(ownerAccount.name);
        const existingSecret = existingSecrets.find(secret => secret.name === name);

        if (existingSecret) {
          await EnvironmentSecretMutation.deleteAsync(existingSecret.id);

          Log.withTick(
            `Deleting existing secret ${chalk.bold(name)} on account ${chalk.bold(
              ownerAccount.name
            )}.`
          );
        }
      }

      const secret = await EnvironmentSecretMutation.createForAccountAsync(
        { name, value: secretValue },
        ownerAccount.id
      );

      if (!secret) {
        throw new Error(
          `Could not create secret with name ${name} on account with id ${ownerAccount.id}`
        );
      }

      Log.withTick(
        `️Created a new secret ${chalk.bold(name)} on account ${chalk.bold(ownerAccount.name)}.`
      );
    }
  }
}
