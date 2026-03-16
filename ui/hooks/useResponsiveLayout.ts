import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;
const LARGE_TABLET_BREAKPOINT = 1100;

export default function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isTablet = width >= TABLET_BREAKPOINT;
  const isLargeTablet = width >= LARGE_TABLET_BREAKPOINT;

  const contentMaxWidth = isLargeTablet ? 1080 : isTablet ? 920 : undefined;
  const modalMaxWidth = isLargeTablet ? 680 : isTablet ? 560 : 420;
  const formMaxWidth = isLargeTablet ? 680 : isTablet ? 560 : undefined;

  return {
    width,
    height,
    isLandscape,
    isTablet,
    isLargeTablet,
    contentMaxWidth,
    modalMaxWidth,
    formMaxWidth,
  };
}
