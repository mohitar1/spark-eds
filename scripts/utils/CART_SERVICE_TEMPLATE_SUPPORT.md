# Template Cart Support Documentation

## Overview

The Cart Service has been extended to support **dual carts**: one for **assets** and one for **templates**. Both carts use the same core infrastructure but maintain completely separate storage and state, allowing users to manage both types of items independently.

## Key Features

✅ **Separate Storage** - Assets and templates stored in different localStorage keys
✅ **Unified API** - Same cart service methods work for both types
✅ **Full Backward Compatibility** - Existing asset cart code continues to work unchanged
✅ **Cross-Tab Sync** - Both carts sync across browser tabs via BroadcastChannel
✅ **Type-Safe** - Optional `type` parameter prevents mixing asset and template operations

## Architecture

### Storage Separation

```
localStorage
├── cartAssetItems: [...]      // Asset cart (existing)
└── cartTemplateItems: [...]   // Template cart (new)
```

### State Separation

```javascript
state = {
  cartAssetItems: [],      // Asset cart items
  cartTemplateItems: [],   // Template cart items
  // ... other state
}
```

### Key Mapping (`cart-keys.js`)

```javascript
export function getStorageKey(type = 'asset') {
  return type === 'template' ? 'cartTemplateItems' : 'cartAssetItems';
}

export function getStateKey(type = 'asset') {
  return type === 'template' ? 'cartTemplateItems' : 'cartAssetItems';
}
```

## API Usage

### Basic Operations

#### Add Items

```javascript
import { cart } from '../../scripts/utils/cart-service.js';

// Add assets (default)
await cart.add(assetItems);

// Add templates
await cart.add(templateItems, { type: 'template' });
```

#### Remove Items

```javascript
// Remove assets (default)
await cart.remove(['asset-id-1', 'asset-id-2']);

// Remove templates
await cart.remove(['template-id-1', 'template-id-2'], { type: 'template' });
```

#### Check if Item in Cart

```javascript
// Check asset
const isAssetInCart = cart.contains('asset-id-1');

// Check template
const isTemplateInCart = cart.contains('template-id-1', { type: 'template' });

// Check multiple items (all must be in cart)
const allInCart = cart.contains(['id-1', 'id-2'], { type: 'template' });
```

#### Get Cart Items

```javascript
// Get assets
const assets = cart.getItems();

// Get templates
const templates = cart.getItems({ type: 'template' });
```

#### Get Cart Count

```javascript
// Asset count
const assetCount = cart.count();

// Template count
const templateCount = cart.count({ type: 'template' });
```

#### Clear Cart

```javascript
// Clear assets
await cart.clear();

// Clear templates
await cart.clear({ type: 'template' });
```

#### Check if Empty

```javascript
// Check if asset cart is empty
if (cart.isEmpty()) { ... }

// Check if template cart is empty
if (cart.isEmpty({ type: 'template' })) { ... }
```

### Advanced Usage

#### Button Sync for Templates

```javascript
import { cart } from '../../scripts/utils/cart-service.js';

const cleanup = cart.syncButtons({
  selector: '.add-template-btn',
  getAssetIds: (btn) => {
    const card = btn.closest('.template-card');
    return card ? [card.dataset.templateId] : [];
  },
  labels: {
    add: 'Add Template',
    remove: 'Remove Template'
  },
  type: 'template'  // Important: specify type!
});

// Cleanup when component unmounts
cleanup();
```

#### Callbacks and Progress

```javascript
await cart.add(templates, {
  type: 'template',
  onStart: ({ total }) => {
    console.log(`Adding ${total} templates...`);
  },
  onComplete: (result) => {
    console.log(`Added ${result.addedCount} templates`);
    console.log(`Total templates in cart: ${result.totalInCart}`);
  },
  onError: (error) => {
    console.error('Failed to add templates:', error);
  }
});
```

## Implementation Details

### Type Parameter Flow

```
User calls cart.add(items, { type: 'template' })
        ↓
cart-service.js: Extracts type, calls addItemsToCart()
        ↓
cart-utils.js: Uses getStorageKey(type) and getStateKey(type)
        ↓
cart-keys.js: Returns 'cartTemplateItems'
        ↓
localStorage.setItem('cartTemplateItems', ...)
setState({ cartTemplateItems: [...] })
        ↓
BroadcastChannel: Broadcasts { cartType: 'template', items: [...] }
        ↓
Other tabs: Update their template cart state
```

### Key Differences: Assets vs Templates

| Feature | Assets | Templates |
|---------|--------|-----------|
| **Storage Key** | `cartAssetItems` | `cartTemplateItems` |
| **State Key** | `cartAssetItems` | `cartTemplateItems` |
| **Badge Update** | ✅ Yes | ❌ No |
| **Fetch Details** | ✅ Yes (API call) | ❌ No |
| **Background Jobs** | ✅ Yes (for large batches) | ❌ No |
| **Cross-Tab Sync** | ✅ Yes | ✅ Yes |

### Why Templates Don't Use Background Jobs

Background jobs and API detail fetching are **disabled for templates** because:

1. **Templates are pre-fetched** - Template data is already complete when added to cart
2. **No API enrichment needed** - Unlike assets, templates don't require additional metadata
3. **Simpler workflow** - Template cart operations are synchronous and fast
4. **No badge** - Templates don't have a global cart badge that needs updating

```javascript
// In cart-utils.js
export async function addItemsToCart(items, options = {}) {
  const {
    type = 'asset',
    fetchDetails = (type === 'asset'),           // Only fetch for assets
    useBackgroundJob = (type === 'asset'),       // Only background jobs for assets
    backgroundJobThreshold = 10,
  } = options;
  
  // ... rest of implementation
}
```

## Migration Guide

### Before: Asset-Only Cart

```javascript
// Old code - asset cart only
import { cart } from '../../scripts/utils/cart-service.js';

await cart.add(assets);
const items = cart.getItems();
const count = cart.count();
```

### After: Dual Cart Support

```javascript
// New code - works for both!
import { cart } from '../../scripts/utils/cart-service.js';

// Assets (unchanged - backward compatible)
await cart.add(assets);
const assetItems = cart.getItems();
const assetCount = cart.count();

// Templates (new feature)
await cart.add(templates, { type: 'template' });
const templateItems = cart.getItems({ type: 'template' });
const templateCount = cart.count({ type: 'template' });
```

**No breaking changes!** All existing asset cart code continues to work without modification.

## Cross-Tab Synchronization

### How It Works

When a template is added in Tab 1:

```javascript
// Tab 1
await cart.add(template, { type: 'template' });
```

The following happens:

1. **localStorage updated** → `cartTemplateItems` updated in Tab 1
2. **State updated** → `setState({ cartTemplateItems: [...] })`
3. **Broadcast sent** → `{ type: 'cartChanged', cartType: 'template', items: [...] }`
4. **Other tabs receive** → Update their localStorage and state
5. **UI updates** → All tabs show updated template cart

### Message Format

```javascript
// Asset cart message
{
  type: 'cartChanged',
  cartType: 'asset',
  items: [{ assetId: '...', name: '...' }]
}

// Template cart message
{
  type: 'cartChanged',
  cartType: 'template',
  items: [{ id: '...', name: '...', type: 'template' }]
}
```

### Independent Synchronization

Asset and template carts sync **independently**:

```
Tab 1: Add asset    → Tab 2: Asset cart updates, template cart unchanged ✅
Tab 1: Add template → Tab 2: Template cart updates, asset cart unchanged ✅
```

## Complete Example: Template Cart Integration

### 1. Template Card Component

```javascript
import { cart } from '../../scripts/utils/cart-service.js';
import setButtonLoading from '../koassets-search/utils/dom-utils.js';

export function createTemplateCard(template) {
  const card = document.createElement('div');
  card.className = 'template-card';
  card.dataset.templateId = template.id;
  
  const button = document.createElement('button');
  button.className = 'primary-button pill-button add-template-btn';
  button.textContent = 'Add Template';
  
  button.addEventListener('click', async () => {
    try {
      setButtonLoading(button, true);
      
      const isInCart = cart.contains(template.id, { type: 'template' });
      
      if (isInCart) {
        await cart.remove(template.id, { type: 'template' });
      } else {
        await cart.add(template, { type: 'template' });
      }
    } catch (error) {
      console.error('Cart operation failed:', error);
    } finally {
      setButtonLoading(button, false);
    }
  });
  
  card.appendChild(button);
  return card;
}
```

### 2. Template Gallery with Button Sync

```javascript
import { cart } from '../../scripts/utils/cart-service.js';

let cartSyncCleanup = null;

export function initTemplateGallery() {
  // Render template cards
  renderTemplates();
  
  // Setup cart button sync
  cartSyncCleanup = cart.syncButtons({
    selector: '.add-template-btn',
    getAssetIds: (btn) => {
      const card = btn.closest('.template-card');
      return card ? [card.dataset.templateId] : [];
    },
    labels: {
      add: 'Add Template',
      remove: 'Remove Template'
    },
    type: 'template'
  });
}

export function cleanup() {
  if (cartSyncCleanup) {
    cartSyncCleanup();
    cartSyncCleanup = null;
  }
}
```

### 3. Template Cart Panel

```javascript
import { cart } from '../../scripts/utils/cart-service.js';
import { subscribe } from '../../scripts/cart-state.js';

export function createTemplateCartPanel() {
  const panel = document.createElement('div');
  panel.className = 'template-cart-panel';
  
  // Render current templates
  const renderTemplates = () => {
    const templates = cart.getItems({ type: 'template' });
    panel.innerHTML = `
      <h2>Template Cart (${templates.length})</h2>
      <div class="template-list">
        ${templates.map(t => `
          <div class="template-item">
            <span>${t.name}</span>
            <button class="remove-btn" data-id="${t.id}">Remove</button>
          </div>
        `).join('')}
      </div>
    `;
    
    // Attach remove handlers
    panel.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await cart.remove(btn.dataset.id, { type: 'template' });
      });
    });
  };
  
  // Initial render
  renderTemplates();
  
  // Subscribe to template cart changes
  const unsubscribe = subscribe((state, prevState, updates) => {
    if (updates.cartTemplateItems) {
      renderTemplates();
    }
  });
  
  return { panel, cleanup: unsubscribe };
}
```

## Testing

### Unit Tests

```javascript
import { cart } from '../../scripts/utils/cart-service.js';

describe('Template Cart', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  
  it('should add templates to separate storage', async () => {
    const template = { id: 'template-1', name: 'Test Template' };
    
    await cart.add(template, { type: 'template' });
    
    const templates = cart.getItems({ type: 'template' });
    const assets = cart.getItems({ type: 'asset' });
    
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('template-1');
    expect(assets).toHaveLength(0);
  });
  
  it('should not mix asset and template carts', async () => {
    const asset = { assetId: 'asset-1', name: 'Test Asset' };
    const template = { id: 'template-1', name: 'Test Template' };
    
    await cart.add(asset);
    await cart.add(template, { type: 'template' });
    
    expect(cart.count()).toBe(1);              // Asset cart
    expect(cart.count({ type: 'template' })).toBe(1);  // Template cart
  });
  
  it('should sync template buttons', () => {
    const template = { id: 'template-1' };
    document.body.innerHTML = `
      <button class="add-template-btn" data-template-id="template-1">
        Add Template
      </button>
    `;
    
    const cleanup = cart.syncButtons({
      selector: '.add-template-btn',
      getAssetIds: (btn) => [btn.dataset.templateId],
      labels: { add: 'Add Template', remove: 'Remove Template' },
      type: 'template'
    });
    
    // Add to cart
    cart.add(template, { type: 'template' });
    
    // Check button updated
    const btn = document.querySelector('.add-template-btn');
    expect(btn.textContent).toBe('Remove Template');
    expect(btn.classList.contains('remove-from-cart')).toBe(true);
    
    cleanup();
  });
});
```

### Manual Testing Checklist

- [ ] Add template to cart in Tab 1
- [ ] Verify template appears in cart panel
- [ ] Verify template count updates
- [ ] Open Tab 2
- [ ] Verify template cart synced to Tab 2
- [ ] Remove template from Tab 2
- [ ] Verify removal synced to Tab 1
- [ ] Add asset to cart in Tab 1
- [ ] Verify asset and template carts are independent
- [ ] Clear template cart
- [ ] Verify asset cart unchanged

## Backward Compatibility

### Guaranteed Compatibility

✅ **All existing asset cart code works unchanged**
- Default `type` parameter is `'asset'`
- Storage key remains `'cartAssetItems'`
- State key remains `'cartAssetItems'`
- Cart badge behavior unchanged

### Migration Path

**Phase 1: No changes required**
- Existing code continues to work
- Template support available for new features

**Phase 2: Optional modernization**
- Use unified cart API for consistency
- Explicit `type` parameter for clarity

```javascript
// Old (still works)
await cart.add(assets);

// New (more explicit)
await cart.add(assets, { type: 'asset' });
```

## Best Practices

### ✅ DO

- **Always specify `type` parameter** when working with templates
  ```javascript
  cart.add(templates, { type: 'template' })
  ```

- **Use separate button selectors** for asset and template buttons
  ```javascript
  cart.syncButtons({ selector: '.add-asset-btn', type: 'asset' })
  cart.syncButtons({ selector: '.add-template-btn', type: 'template' })
  ```

- **Clean up cart sync** when component unmounts
  ```javascript
  const cleanup = cart.syncButtons({ ... });
  // Later...
  cleanup();
  ```

- **Check the correct cart type** when checking if item is in cart
  ```javascript
  cart.contains(templateId, { type: 'template' })
  ```

### ❌ DON'T

- **Don't mix cart types** in a single operation
  ```javascript
  // ❌ Bad - mixing types
  await cart.add([asset, template]);
  
  // ✅ Good - separate operations
  await cart.add(asset, { type: 'asset' });
  await cart.add(template, { type: 'template' });
  ```

- **Don't forget the type parameter** when working with templates
  ```javascript
  // ❌ Bad - defaults to asset cart
  cart.add(template);
  
  // ✅ Good - explicit type
  cart.add(template, { type: 'template' });
  ```

- **Don't assume cart operations are synchronous**
  ```javascript
  // ❌ Bad
  cart.add(items);
  const count = cart.count();  // May not reflect the add yet
  
  // ✅ Good
  await cart.add(items);
  const count = cart.count();
  ```

## Troubleshooting

### Templates Appearing in Asset Cart

**Problem:** Templates showing up in asset cart instead of template cart.

**Cause:** Missing `type` parameter.

**Fix:**
```javascript
// ❌ Wrong
await cart.add(template);

// ✅ Correct
await cart.add(template, { type: 'template' });
```

### Button Sync Not Working for Templates

**Problem:** Template buttons not updating after cart changes.

**Cause:** Missing `type` parameter in `syncButtons`.

**Fix:**
```javascript
cart.syncButtons({
  selector: '.add-template-btn',
  getAssetIds: (btn) => [...],
  labels: { add: '...', remove: '...' },
  type: 'template'  // Don't forget this!
});
```

### Cross-Tab Sync Not Working

**Problem:** Template cart changes in one tab don't reflect in another.

**Cause:** Check BroadcastChannel is working (see [Cart Broadcast Analysis](./CART_BROADCAST_ANALYSIS.md)).

**Debug:**
```javascript
// Check if BroadcastChannel is supported
console.log('BroadcastChannel:', typeof BroadcastChannel !== 'undefined');

// Check template cart state
console.log('Templates:', cart.getItems({ type: 'template' }));
```

## Future Enhancements

### Potential Features

1. **Custom Cart Types**
   - Support for additional cart types beyond assets and templates
   - Generic type parameter: `cart.add(items, { type: 'custom-type' })`

2. **Cart Metadata**
   - Add metadata to each cart (e.g., created date, modified date)
   - Enable cart versioning and history

3. **Cart Limits**
   - Configurable max item counts per cart type
   - Quota warnings and enforcement

4. **Cart Analytics**
   - Track cart usage patterns
   - Most added/removed items
   - Average cart size

5. **Cart Persistence**
   - Sync carts to user profile
   - Restore cart across devices

## Summary

The template cart support extends the existing cart system with a clean, type-safe API for managing both assets and templates. The implementation maintains full backward compatibility while providing powerful new capabilities for template management.

**Key Benefits:**
- ✅ Unified API for assets and templates
- ✅ Separate storage prevents data mixing
- ✅ Full cross-tab synchronization
- ✅ Zero breaking changes
- ✅ Type-safe operations

---

**Related Documentation:**
- [Cart Service Documentation](./CART_SERVICE_DOCUMENTATION.md)
- [Cart Broadcast Analysis](./CART_BROADCAST_ANALYSIS.md)

**Last Updated:** January 2026
