declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_API_URL: string;
      EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID?: string;
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: string;
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
      EXPO_PUBLIC_PLAYSTORE_URL?: string;
    }
  }
}

export {};
