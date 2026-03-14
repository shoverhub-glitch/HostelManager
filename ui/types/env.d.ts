declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_API_URL: string;
      EXPO_PUBLIC_PLAYSTORE_URL?: string;
    }
  }
}

export {};
