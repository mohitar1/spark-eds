# Content Stores

Content stores are browsable asset libraries organized by brand, campaign, or category. They provide tabbed navigation, search, and teaser cards to help users find and access marketing assets.

## When to Use

- Curated brand collections (e.g., Coca-Cola, Fanta, Sprite)
- Campaign asset libraries (e.g., Holiday 2025, FIFA WC 2026)
- Category-based toolkits (e.g., OOH, Digital, POS)
- Any collection of assets that users need to browse and search

## How It Works

A content store page consists of:

1. **Page metadata** — title and other page-level settings
2. **Banner image** (optional) — a hero image at the top
3. **Carousel** (optional) — a "What's New" slider highlighting featured stores
4. **Content-stores block** — the main browsable interface, powered by a JSON spreadsheet

The content-stores block reads data from a JSON spreadsheet and renders it as a hierarchical, tabbed interface with built-in search.

## Page Structure

A typical content store page follows this template:

```
┌─────────────────────────────────────┐
│  Metadata (title)                   │
├─────────────────────────────────────┤
│  Banner Image (optional)            │
├─────────────────────────────────────┤
│  Carousel — "What's New" (optional) │
├─────────────────────────────────────┤
│  Content-Stores Block               │
│  ┌─────────────────────────────────┐│
│  │  Search box                     ││
│  │  Section title                  ││
│  │  Tab row (level 1)              ││
│  │    Tab row (level 2)            ││
│  │    Teaser cards / items         ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

## The Content-Stores Block

### Block Configuration

The block is authored as a table with key-value pairs:

| Content-Stores |  |
|---|---|
| sheetPath | /path/to/spreadsheet.json |

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sheetPath` | Yes | Path to the JSON spreadsheet that contains the store data |
| `sheetName` | No | Name of the sheet within the spreadsheet. Defaults to `data` |

Example with a named sheet:

| Content-Stores |  |
|---|---|
| sheetPath | /content-stores/.all-content-stores/store-data.json |
| sheetName | beverages |

## Data Format — The Spreadsheet

The content-stores block reads its data from a multi-sheet JSON spreadsheet. Each row in the spreadsheet represents one item in the store. The block processes rows in order to build the hierarchy.

### Spreadsheet Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | The kind of content this row represents (see [Content Types](#content-types)) |
| `path` | Yes | Hierarchical navigation path using ` >>> ` as separator (see [Path Hierarchy](#path-hierarchy--navigation)) |
| `imageUrl` | No | URL to the item's thumbnail image |
| `linkURL` | No | URL the item links to when clicked |
| `text` | No | Rich text content (HTML). Used for text blocks, info text, and accordion body content |
| `synonym` | No | Comma-separated alternative search terms (see [Search & Filtering](#search--filtering)) |

### Example Spreadsheet Rows

| type | path | imageUrl | linkURL | text | synonym |
|------|------|----------|---------|------|---------|
| section-title | Global Initiatives | | | | |
| tab | Global Initiatives >>> Coca-Cola | | | | |
| tab | Global Initiatives >>> Coca-Cola >>> Holiday | | | | |
| teaser | Global Initiatives >>> Coca-Cola >>> Holiday >>> Holiday 2025  | /images/holiday.png | /content-stores/holiday-2025 | | christmas, xmas, winter |
| button | Global Initiatives >>> Coca-Cola >>> Holiday >>> View All |  | /en/search/assets?query=holiday | | |

## Content Types

Each row's `type` field determines how it is rendered. Here are all supported types:

### Structural Types

| Type | Purpose | Rendering |
|------|---------|-----------|
| `section-title` | Top-level section heading | Rendered as an `<h2>` heading that groups content below it |
| `tab` | Creates a tab button in the navigation | Tabs are organized hierarchically; nested tabs create multiple tab rows |

### Content Types

| Type | Purpose | Rendering |
|------|---------|-----------|
| `teaser` | Clickable card with image, title, and link | Card layout with thumbnail; clicking opens the linked page |
| `teaser-card` | Variant of teaser | Same as `teaser` but styled as a card variant |
| `button` | Call-to-action button | Styled as a button; links open in a new tab |
| `text` | Rich text content block | Renders HTML content directly; optionally clickable if `linkURL` is set |
| `info-text` | Informational text | Smaller informational text block, typically used for notes or descriptions |
| `accordion` | Expandable/collapsible section | Click to expand; content comes from `text` field or child `item` rows |
| `item` | Child item within an accordion | Rendered as a list item inside its parent accordion |

### How Types Interact

- **`section-title`** rows start a new section. All subsequent rows belong to that section until the next `section-title`.
- **`tab`** rows define the tab navigation tree. Each tab's content includes teasers and items placed under its path.
- **`accordion`** rows can contain content in two ways:
  - Inline `text` field with rich HTML
  - Child `item` rows whose path starts with the accordion's path (e.g., `MyAccordion >>> Child Item`)
- **`teaser`** and **`teaser-card`** rows attach to the tab at their parent path (all segments except the last).

## Path Hierarchy & Navigation

The `path` field creates the hierarchical navigation structure. Segments are separated by ` >>> ` (space-arrow-space).

### How Paths Work

```
Section Title
  └── Tab Level 1
        └── Tab Level 2
              └── Teaser / Button / Item
```

Example paths and what they create:

| Path | Effect |
|------|--------|
| `Beverages` | Single-segment path — used for section titles and top-level items |
| `Beverages >>> Coca-Cola` | Creates a "Coca-Cola" tab under the "Beverages" section |
| `Beverages >>> Coca-Cola >>> Holiday` | Creates a nested "Holiday" tab under "Coca-Cola" |
| `Beverages >>> Coca-Cola >>> Holiday >>> Campaign 2025` | Places a teaser/item in the "Holiday" tab |

### Navigation Rendering

The block renders tabs in rows by depth:

```
[Coca-Cola]  [Fanta]  [Sprite]          ← Tab row level 1
   [Holiday]  [Summer]  [Sports]        ← Tab row level 2 (children of selected level 1)
      [Teaser Card 1]  [Teaser Card 2]  ← Content for selected level 2 tab
```

Selecting a tab at any level updates the content area and shows the next level of child tabs (if any).

## Creating a New Content Store

### Step 1: Prepare the Spreadsheet

Create a Sheet with your store data following the [data format](#data-format--the-spreadsheet). Each row defines one item in the store. The spreadsheet is typically managed in the DA content repository.

Organize your rows in this order:
1. `section-title` row to define the section
2. `tab` rows to define the navigation hierarchy
3. `teaser`, `button`, `text`, `accordion`, and `item` rows for actual content

### Step 2: Create the Page

Create a new Document in the content repository. A content store page typically includes:

1. **Metadata** — set the page title
2. **Banner image** (optional)
3. **Carousel** (optional) — for highlighting featured items
4. **Content-stores block** — pointing to your spreadsheet

### Step 3: Add the Content-Stores Block

Author the block as a table with the `sheetPath` configuration:

| Content-Stores |  |
|---|---|
| sheetPath | /content-stores/.my-store/store-data.json |

### Step 4: Preview and Publish

1. Use the AEM Sidekick to **Preview** the page and verify the content renders correctly
2. Check that tabs, teasers, and search all work as expected
3. **Publish** when ready

## Editing & Managing Content Stores

### Adding Items

Add new rows to the spreadsheet with the appropriate `type`, `path`, and other fields. New items appear in the store after the page is previewed/published.

### Removing Items

Delete the corresponding row(s) from the spreadsheet. If removing a tab, also remove all items whose paths start with that tab's path.

### Reordering Items

The block processes rows in spreadsheet order. Within a tab, teasers and items appear in the order they are listed. Move rows up or down in the spreadsheet to change their display order.

### Updating Images and Links

Edit the `imageUrl` and `linkURL` fields in the spreadsheet. Images are automatically optimized for web delivery.

## Search & Filtering

The content-stores block includes a built-in search box. When a user types a search term, the block filters all content across all sections and tabs.

### What Gets Searched

Search matches against these fields (case-insensitive):

- **text** — the rich text content
- **synonym** — comma-separated alternative terms
- **path** — each segment of the path

### Optimizing for Search

Use the `synonym` field to add alternative terms that users might search for:

| type | path | synonym |
|------|------|---------|
| teaser | ... >>> Holiday 2025 | christmas, xmas, winter, seasonal |

Tips:
- Add common abbreviations (e.g., `OOH, out of home`)
- Include alternate spellings or brand variations
- Separate multiple terms with commas

### Search Results Display

Search results show:
- Each matching item with a path breadcrumb showing its location in the hierarchy
- Clicking a path breadcrumb navigates to that tab and clears the search
- Matched accordion items are grouped under their parent accordion
- A count of matching items is shown

## Tips & Best Practices

### Path Naming

- Use clear, human-readable names (they appear as tab labels)
- Keep path segments concise but descriptive
- Be consistent with naming conventions across stores
- Avoid trailing spaces in path segments

### Images

- Use consistent image dimensions for uniform teaser cards (recommended: 120x120px for thumbnails)
- Always provide `imageUrl` for teasers — missing images show as blank placeholders
- Images are automatically optimized by the platform

### Content Organization

- Start with `section-title` rows to create logical groupings
- Use 2-3 levels of tabs maximum to keep navigation simple
- Put the most-accessed content in the first tabs
- Group related items under the same tab path

### Common Mistakes

- **Missing `type` field** — every row must have a type
- **Incorrect path separators** — use ` >>> ` (with spaces), not `/` or `>`
- **Orphaned items** — if an item's parent tab path doesn't exist, it may not display correctly
- **Accordion without content** — an accordion needs either a `text` field or child `item` rows

## Related

- [Carousel](blocks/carousel.md) — for the optional "What's New" slider on store pages
- [Cards](blocks/cards.md) — for simpler card grid layouts
- [Tabs](blocks/tabs.md) — for basic tabbed content (non-hierarchical)
- [Best Practices](best-practices.md) — general authoring tips
