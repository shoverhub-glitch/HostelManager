# Read-Only Offline Support

## How It Works

**App displays cached data when offline. Operations (create/update/delete) are disabled.**

- ✅ Users can view cached data offline
- ✅ App shows "📡 Offline" indicator at top
- ✅ Forms show "Unavailable when offline" with disabled submit
- ❌ No operations allowed when offline
- ❌ No queue, no syncing, no retry logic

## For Forms

### 1. Import Hook
```tsx
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
```

### 2. Use in Component
```tsx
const isOnline = useNetworkStatus();
```

### 3. Disable Form Operations
```tsx
<Button 
  disabled={!isOnline}
  title="Submit"
/>

{!isOnline && (
  <Text style={{ color: 'red', marginTop: 10 }}>
    📡 Offline - Features unavailable. Please check your connection.
  </Text>
)}
```

## How Data Caching Works

**Automatic** - All GET requests are cached:
1. User loads a list (e.g., `/tenants`)
2. Response cached in AsyncStorage
3. If offline, app shows cached version
4. Cache expires after 24 hours

No code needed - it's built into `apiClient.ts`.

## Files Structure

```
ui/
├── services/
│   └── dataCache.ts             ← GET response caching
│
├── hooks/
│   └── useNetworkStatus.ts      ← Online/offline detection
│
├── components/
│   └── OfflineIndicator.tsx     ← Shows 📡 banner
│
└── app/
    ├── _layout.tsx              ← Initialized with OfflineIndicator
    └── ...forms...              ← Add useNetworkStatus to each
```

## Quick Integration Checklist

For each form (add-tenant, add-payment, etc.):

- [ ] Import: `useNetworkStatus`
- [ ] Call hook: `const isOnline = useNetworkStatus()`
- [ ] Disable button: `disabled={!isOnline}`
- [ ] Show message: `{!isOnline && <Text>Offline message</Text>}`

**Time per form: 2-3 minutes**

## Example: add-tenant.tsx

```tsx
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function AddTenant() {
  const isOnline = useNetworkStatus();  // ← Add this
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    // ... form validation ...
    await tenantService.create(formData);
  };

  return (
    <View>
      {/* ... form fields ... */}
      
      {!isOnline && (
        <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8 }}>
          <Text style={{ color: '#991b1b' }}>
            📡 Offline - You cannot create tenants without an internet connection
          </Text>
        </View>
      )}

      <Button
        disabled={loading || !isOnline}  // ← Add !isOnline check
        title={isOnline ? "Next" : "Offline"}
        onPress={handleNext}
      />
    </View>
  );
}
```

## Testing

1. **Test cached data**:
   - Load list online (e.g., `/manage-properties`)
   - Go offline (airplane mode)
   - Should still see cached data ✓
   - Indicator shows "📡 Offline" ✓

2. **Test disabled forms**:
   - Go offline
   - Open add-tenant form
   - Submit button should be disabled ✓
   - Message should show ✓

3. **Test comeback online**:
   - Go online
   - Button should enable immediately ✓
   - Forms should work ✓

## That's It!

No mutation queue, no syncing, no complexity. Just:
- `dataCache.ts` - Caches GET requests
- `useNetworkStatus.ts` - Detects online/offline  
- `OfflineIndicator.tsx` - Shows offline banner
- Form integration - 2 lines per form

Simple, production-ready, maintainable. ✨
