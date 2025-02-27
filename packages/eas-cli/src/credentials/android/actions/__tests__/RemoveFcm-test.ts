import { asMock } from '../../../../__tests__/utils';
import { confirmAsync } from '../../../../prompts';
import {
  getNewAndroidApiMock,
  testAndroidAppCredentialsFragment,
} from '../../../__tests__/fixtures-android';
import { createCtxMock } from '../../../__tests__/fixtures-context';
import { getAppLookupParamsFromContextAsync } from '../BuildCredentialsUtils';
import { RemoveFcm } from '../RemoveFcm';

jest.mock('../../../../prompts');
asMock(confirmAsync).mockImplementation(() => true);

describe(RemoveFcm, () => {
  it('removes an FCM API Key', async () => {
    const ctx = createCtxMock({
      nonInteractive: false,
      android: {
        ...getNewAndroidApiMock(),
        getAndroidAppCredentialsWithCommonFieldsAsync: jest.fn(
          () => testAndroidAppCredentialsFragment
        ),
      },
    });
    const appLookupParams = await getAppLookupParamsFromContextAsync(ctx);
    const removeFcmApiKeyAction = new RemoveFcm(appLookupParams);
    await removeFcmApiKeyAction.runAsync(ctx);
    expect(ctx.android.deleteFcmAsync).toHaveBeenCalledTimes(1);
  });
  it('errors in Non-Interactive Mode', async () => {
    const ctx = createCtxMock({ nonInteractive: true });
    const appLookupParams = await getAppLookupParamsFromContextAsync(ctx);
    const removeFcmApiKeyAction = new RemoveFcm(appLookupParams);
    await expect(removeFcmApiKeyAction.runAsync(ctx)).rejects.toThrowError();
  });
});
