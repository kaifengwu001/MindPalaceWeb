// src/lib/amplify-config.ts
import { Amplify } from 'aws-amplify';
import { ResourcesConfig } from 'aws-amplify';

const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      //region: import.meta.env.VITE_APP_REGION,
      userPoolId: import.meta.env.VITE_APP_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_APP_USER_POOL_CLIENT_ID,
    }
  },
  API: {
    REST: {
      MindPalaceApi: {
        endpoint: import.meta.env.VITE_APP_API_URL,
        region: import.meta.env.VITE_APP_REGION,
      }
    }
  }
};

export const configureAmplify = () => {
  Amplify.configure(amplifyConfig);
};