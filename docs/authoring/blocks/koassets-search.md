# KOAssets Search

A full-featured asset search and management interface. Provides search results with faceted filtering, grid/list views, asset preview, details, cart management, rights checking, and bulk actions.

## When to Use

- Dedicated search results pages where users browse and download assets
- Filtered asset views focused on specific brands, campaigns, or categories
- Pages that need the complete asset management workflow (search, filter, preview, add to cart, download)

## Authoring

### Basic Structure

| KOAssets Search |  |
|-----------------|--|

With no configuration, the block renders the full search interface using all default settings: 24 results per page, sorted by last modified date (descending), with the standard set of facets.

### Configuration

All options are optional — add only the rows you need:

| Option | Description                                                                                                                                       | Default |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| `accordionTitle` | Title for the help/guidelines accordion at the top                                                                                                | `"Search Assets - where you can discover the company's latest and greatest content!"` |
| `accordionContent` | HTML content for the help accordion (instructions, links, tips)                                                                                   | Default help text with search, filter, download, and rights guidance |
| `excFacets` | JSON object defining custom facets (see [Custom Facets](#custom-facets) below)                                                                    | Standard facets (Brand, Campaign, Category, etc.) |
| `sortType` | Default sort field: `dateCreated`, `lastModified`, or `size`                                                                                      | `lastModified` |
| `sortDirection` | Default sort order: `ascending` or `descending`                                                                                                   | `descending` |
| `hitsPerPage` | Number of results per page (1–50)                                                                                                                 | `24` |
| `presetFilters` | Bulleted list of facet values to pre-apply as filters. Bulleted list items are combined with "AND". Single list item can contain "OR" (see below) | None |

### Configuration Example

| KOAssets Search |                         |
|-----------------|-------------------------|
| accordionTitle | Browse Campaign Assets  |
| sortType | dateCreated             |
| sortDirection | descending              |
| hitsPerPage | 36                      |
| presetFilters | - tccc-contentType:marketing|

### Custom Accordion Content

Replace the default help text with your own HTML:

| KOAssets Search |  |
|-----------------|--|
| accordionTitle | How to Find Assets |
| accordionContent | `<p><b>Search</b> by keyword or <b>filter</b> by brand and campaign on the right.</p><p>Need help? Contact <a href="mailto:assetmanagers@coca-cola.com">assetmanagers@coca-cola.com</a></p>` |

### Custom Facets

Override the default facet panel by providing a JSON object in `excFacets`. Each key is a facet identifier, and the value defines its configuration:

```json
{
  "tccc-brand": {
    "label": "Brand",
    "type": "tags"
  },
  "tccc-campaignName": {
    "label": "Campaign",
    "type": "string"
  },
  "repo-createDate": {
    "label": "Date Created",
    "type": "date"
  }
}
```

**Facet types:**

| Type | Description |
|------|-------------|
| `string` | Simple checkboxes with text values (e.g., Campaign, Agency Name) |
| `tags` | Hierarchical taxonomy with expandable tree (e.g., Brand, Asset Category). |
| `date` | Date range picker (e.g., Date Created) |

### Default Facets

When no `excFacets` is configured, the following facets are shown:

| Facet | Type |
|-------|------|
| Brand | tags |
| Campaign | string |
| Asset Category and Asset Type Execution | tags |
| Master or Adaptation | string |
| Rights Free | string |
| Intended Market | tags |
| Intended Channel | tags |
| Bottler Content by Country | string |
| Package Size | string |
| Agency Name | string |
| Date Created | date |
| Market Rights Covered | string |
| Media Rights Covered | string |

## Features Overview

### Search

- Text input with auto-focus and clear button
- Searches across asset titles, descriptions, keywords, and file names
- Query is persisted in the URL (`?query=...`) for easy sharing

### Faceted Filtering

- Filter panel on the right side with expandable facet groups
- Search within individual facets to find specific values
- Checkbox selection with automatic result updates
- Hierarchical navigation for tags-based facets (Brand, Category, etc.)
- Date range picker for date facets

### Results Display

- **Grid view** (default) — card-based layout with thumbnails
- **List view** — compact rows with metadata
- Toggle between views using the view buttons in the results header
- **Full Details** toggle shows/hides extended metadata on each card

### Asset Actions

- **Preview** — full-size image preview in a modal
- **Details** — comprehensive asset metadata (technical info, rights, usage)
- **Add to Cart** — stage assets for download
- **Share** — generate shareable links

### Bulk Actions

- Select multiple assets using checkboxes on cards
- Use the **Actions** dropdown to: Select All, Add to Cart, Share, Add to Collection

### Rights Management

- **Rights Free** filter shows only freely downloadable assets
- **Authorized assets** toggle filters to assets you have rights to use
- Rights checking via FADEL integration for market and media channel authorization

### Cart & Download

- Assets added to cart are accessible from the cart icon in the header
- Rights-free assets can be downloaded immediately
- Rights-protected assets require entering intended use information

## URL Parameters

The search state is automatically saved to the URL, making searches shareable and bookmarkable:

| Parameter | Description |
|-----------|-------------|
| `query` | Search text |
| `facetFilters` | Selected facet values (JSON) |
| `numericFilters` | Numeric range filters (JSON) |
| `rightsFilters` | Rights date range, markets, and media channels (JSON) |

## Examples

### Minimal (All Defaults)

| KOAssets Search |  |
|-----------------|--|

Full search interface with default facets, 24 results per page, sorted by last modified.

### Custom Sort and Page Size

| KOAssets Search |  |
|-----------------|--|
| sortType | dateCreated |
| hitsPerPage | 48 |

Shows newest assets first, 48 per page.

### Pre-Filtered by Brand

| KOAssets Search |  |
|-----------------|--|
| presetFilters | - tccc-contentType:marketing OR tccc-contentType:customers |

Opens with the content type filter already applied implicitly

### Custom Accordion with Reduced Facets

| KOAssets Search |  |
|-----------------|--|
| accordionTitle | Template Library |
| accordionContent | `<p>Browse and download brand templates. Use the <b>Brand</b> and <b>Category</b> filters to narrow results.</p>` |
| excFacets | `{"tccc-brand": {"label": "Brand", "type": "tags"}, "tccc-assetCategoryAndType": {"label": "Category", "type": "tags"}}` |

## Live Examples

- Search Assets: [da.live/edit#/.../search/assets](https://da.live/edit#/the-coca-cola-company/koassets/en/search/assets)
- Search Templates: [da.live/edit#/.../search/templates](https://da.live/edit#/the-coca-cola-company/koassets/en/search/templates)

## Tips

- Use `presetFilters` to create focused search pages for specific brands or campaigns without needing custom facets
- Keep `hitsPerPage` at 24–36 for best performance; the maximum is 50 (API limit)
- Custom `accordionContent` is a good place to add page-specific instructions or support links
- URL parameters are automatically updated as users search and filter — they can copy the URL at any time to share their exact search state
- On mobile, the facet panel is hidden behind a toggle button to save screen space
- Sort settings (`sortType`, `sortDirection`) set the initial defaults — users can change them at any time using the dropdown in the results header

## Related

- [Search](search.md) - Simple search bar for navigating to search pages
- [Content Stores](../content-stores.md) - Browsable curated asset libraries with tabs and hierarchy
