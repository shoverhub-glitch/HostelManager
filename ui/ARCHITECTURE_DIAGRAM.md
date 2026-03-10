# Architecture Diagram - Bottom Tab Bar Safe Area

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ SafeAreaProvider (Root)                                 │
│ - Provides inset values to all children                 │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Stack Navigator                                   │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │ Screen: index (Login)                       │ │  │
│  │  │ - No tabs                                   │ │  │
│  │  │ - Full screen keyboard support              │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │ Screen: (tabs) - Tab Navigator              │ │  │
│  │  │                                             │ │  │
│  │  │  ┌───────────────────────────────────────┐ │ │  │
│  │  │  │ Screen Content Area                   │ │ │  │
│  │  │  │ - SafeAreaView (top edge only)        │ │ │  │
│  │  │  │ - ScrollView with static padding      │ │ │  │
│  │  │  │                                       │ │ │  │
│  │  │  │ ┌──────────────────────────────────┐ │ │ │  │
│  │  │  │ │ Tab Screen: Dashboard            │ │ │ │  │
│  │  │  │ │ Tab Screen: Properties           │ │ │ │  │
│  │  │  │ │ Tab Screen: Tenants              │ │ │ │  │
│  │  │  │ │ Tab Screen: Payments             │ │ │ │  │
│  │  │  │ │ Tab Screen: Profile              │ │ │ │  │
│  │  │  │ └──────────────────────────────────┘ │ │ │  │
│  │  │  └───────────────────────────────────────┘ │ │  │
│  │  │                                             │ │  │
│  │  │  ┌───────────────────────────────────────┐ │ │  │
│  │  │  │ CustomTabBar                          │ │ │  │
│  │  │  │ - Reads insets.bottom                 │ │ │  │
│  │  │  │ - Applies safe area padding           │ │ │  │
│  │  │  │ - Height = content + bottomSpace      │ │ │  │
│  │  │  └───────────────────────────────────────┘ │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │ Screen: property-detail                     │ │  │
│  │  │ - No tabs (Stack screen above tabs)         │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Layout Split (React Navigation Automatic)

```
┌─────────────────────────────────────────────┐
│ Device Screen                               │
│                                             │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ Status Bar Safe Area                  ┃  │ ← insets.top
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │                                      │   │
│ │  Screen Content Area                 │   │
│ │  (ScreenContainer)                   │   │
│ │                                      │   │
│ │  - SafeAreaView (top edge)           │   │
│ │  - ScrollView with content           │   │
│ │  - Static paddingBottom              │   │
│ │                                      │   │
│ │                                      │   │
│ │                                      │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ CustomTabBar (56px content)          │   │
│ │  [🏠] [🏢] [👥] [💰] [👤]          │   │
│ └──────────────────────────────────────┘   │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ Home Indicator Safe Area              ┃  │ ← insets.bottom
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└─────────────────────────────────────────────┘
```

## Safe Area Responsibility

```
┌─────────────────────────────────────────────────────────┐
│ WHO HANDLES WHAT?                                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ SafeAreaProvider (Root)                                 │
│  └─> Provides: insets.top, insets.bottom, etc.         │
│                                                         │
│ ScreenContainer                                         │
│  └─> Handles: Top safe area only (status bar)          │
│                                                         │
│ CustomTabBar                                            │
│  └─> Handles: Bottom safe area (home indicator)        │
│      - Reads insets.bottom                              │
│      - Applies as paddingBottom                         │
│      - Calculates total height                          │
│                                                         │
│ Tab Screens (Dashboard, Properties, etc.)               │
│  └─> Handles: Content layout only                      │
│      - Static spacing (no inset calculations)           │
│      - ScrollView padding for visual spacing            │
│                                                         │
│ React Navigation                                        │
│  └─> Handles: Screen/TabBar split automatically        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```
Device Hardware
      │
      ▼
SafeAreaProvider
      │
      ├──> insets.top ──────────> ScreenContainer
      │                            (SafeAreaView edges=['top'])
      │
      └──> insets.bottom ────────> CustomTabBar
                                    (paddingBottom: bottomSpace)

Screens (Tab Screens)
      │
      └──> No inset access needed
           Just static theme spacing
```

## Height Calculation Flow

```
CustomTabBar Component:
┌────────────────────────────────────────┐
│ 1. Get device insets                   │
│    const insets = useSafeAreaInsets()  │
│                                        │
│ 2. Extract bottom inset                │
│    const bottomSpace = insets.bottom   │
│    (34px on iPhone 14, 0px on iPhone 8)│
│                                        │
│ 3. Define content height               │
│    const TAB_BAR_HEIGHT = 56           │
│                                        │
│ 4. Calculate total height              │
│    height: TAB_BAR_HEIGHT + bottomSpace│
│    (90px on iPhone 14, 56px on iPhone 8)│
│                                        │
│ 5. Apply bottom padding                │
│    paddingBottom: bottomSpace          │
│                                        │
└────────────────────────────────────────┘
```

## Screen Content Padding

```
ScrollView:
┌────────────────────────────────────────┐
│ Content starts here                    │
│                                        │
│ [Card components]                      │
│ [Lists]                                │
│ [Forms]                                │
│                                        │
│ Content ends here                      │
│ ▼                                      │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← spacing.xxxl (48px)
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │   Visual padding only
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │   NOT for tab bar!
└────────────────────────────────────────┘
         ▲
         │
    Static theme constant
    Same on all devices
```

## Before vs After

### BEFORE (Problematic)
```
Tab Screen:
  const insets = useSafeAreaInsets();
  paddingBottom: insets.bottom + 80  ❌ Manual calculation
                                     ❌ Device-specific
                                     ❌ Hardcoded magic number

Tab Layout:
  tabBarStyle: {
    height: 64 + insets.bottom       ❌ Manual calculation
    paddingBottom: insets.bottom     ❌ Duplicate safe area
  }
```

### AFTER (Correct)
```
CustomTabBar:
  const bottomSpace = insets.bottom  ✅ Read from provider
  height: TAB_BAR_HEIGHT + bottomSpace ✅ Dynamic calculation
  paddingBottom: bottomSpace         ✅ Apply to container

Tab Screen:
  paddingBottom: spacing.xxxl        ✅ Static theme constant
                                     ✅ Same on all devices
                                     ✅ Visual spacing only

Tab Layout:
  tabBar={(props) => <CustomTabBar {...props} />} ✅ Custom component
  tabBarHideOnKeyboard: true         ✅ Keyboard behavior
```

## Key Takeaways

1. **Single Source**: Only CustomTabBar reads `insets.bottom`
2. **Separation**: Screens don't know about tab bar safe area
3. **Static Padding**: Screens use theme constants for spacing
4. **React Navigation**: Handles screen/tab split automatically
5. **No Magic Numbers**: All values come from insets or theme
