---
title: KO Assets Content Authoring Guide
author: KO Assets Team
date: February 2026
---

# KO Assets Content Authoring Guide

This guide helps content authors create and manage informational pages on the KO Assets portal.

## About This Guide

KO Assets is built on Adobe Experience Manager Edge Delivery Services (EDS) using **Document Authoring**. This guide focuses on KO Assets-specific patterns and blocks. For general Document Authoring concepts, refer to the [Document Authoring documentation](https://docs.da.live/).

## Prerequisites

Before you begin, ensure you have:

- Access to the KO Assets content repository in Document Authoring
- The AEM Sidekick browser extension installed
- Appropriate permissions to create and publish content

## Guide Contents

### Getting Started

- [Getting Started](getting-started.md) - Document Authoring basics and your first page

### Page Structure

- [Page Structure](page-structure.md) - Sections, metadata, and page organization

### Blocks Reference

Blocks are reusable content components. Each block has specific authoring syntax and options.

| Block | Description |
|-------|-------------|
| [Cards](blocks/cards.md) | Content cards with images and links |
| [Carousel](blocks/carousel.md) | Rotating image/content slider |
| [Accordion](blocks/accordion.md) | Expandable/collapsible content sections |
| [Tabs](blocks/tabs.md) | Tabbed content panels |
| [FAQ](blocks/faq.md) | Tabbed accordion for FAQ pages |
| [Note](blocks/note.md) | Callout boxes for important information |
| [Fragment](blocks/fragment.md) | Include reusable content from other pages |
| [Team Cards](blocks/team-cards.md) | Team member display grid |
| [Buttons](blocks/buttons.md) | Call-to-action link styling |

See the [Blocks Overview](blocks/README.md) for general information on how blocks work.

### Additional Topics

- [Images and Media](images-and-media.md) - Working with images, optimization, and alt text
- [Localization](localization.md) - Creating content for multiple locales
- [Best Practices](best-practices.md) - Tips for effective content authoring

## Quick Reference

### Creating a Section Break

Insert a horizontal line or type `---` on its own line to create a new section.

### Creating a Block

1. Insert a table
2. Merge the first row and type the block name (e.g., `Cards`)
3. Add content in the rows below

### Preview and Publish

Use the AEM Sidekick extension to:
- **Preview** - See your changes before publishing
- **Publish** - Make content live on the site

## Need Help?

- [Document Authoring Docs](https://docs.da.live/) - General authoring reference
- [AEM Edge Delivery Services](https://www.aem.live/docs/) - Platform documentation


---


# Getting Started

This guide walks you through the basics of creating content for KO Assets using Document Authoring.

## What is Document Authoring?

Document Authoring is a web-based content editing platform that lets you create and manage web pages using a familiar document-editing experience. Your documents automatically become web pages on the KO Assets site.

For comprehensive Document Authoring documentation, visit [docs.da.live](https://docs.da.live/).

## Setup

### 1. Install the Sidekick Extension

The AEM Sidekick is a browser extension that lets you preview and publish your content.

1. Install the [AEM Sidekick](https://chromewebstore.google.com/detail/aem-sidekick/ccfggkjabjahcjoljmgmklhpaccedipo) from the Chrome Web Store
2. Pin it to your browser toolbar for easy access
3. The Sidekick will appear when you're working on KO Assets content

### 2. Access Document Authoring

1. Go to [da.live](https://da.live/)
2. Sign in with your authorized account
3. Navigate to the KO Assets content folder

## Creating Your First Page

### Step 1: Create a New Document

1. In Document Authoring, navigate to the folder where you want to create your page
2. Create a new document
3. Give it a meaningful name (this becomes part of the URL)

> **Tip:** Use lowercase letters and hyphens for page names. For example: `about-us` or `contact-information`

### Step 2: Add Content

Start typing to add content. Document Authoring supports:

- **Headings** - Use heading styles (Heading 1, Heading 2, etc.)
- **Paragraphs** - Regular text becomes paragraph content
- **Lists** - Bulleted and numbered lists
- **Links** - Select text and add a hyperlink
- **Images** - Insert images directly into your document

### Step 3: Add a Block (Optional)

Blocks are special content components like cards, carousels, or accordions. To add a block:

1. Insert a table
2. In the first row, type the block name (e.g., `Cards`)
3. Add your content in the rows below

See the [Blocks Overview](blocks/README.md) for available blocks and how to use them.

### Step 4: Preview Your Page

1. Click the Sidekick icon in your browser toolbar
2. Click **Preview**
3. Your page opens in a new tab showing how it will appear on the site

### Step 5: Publish Your Page

When you're satisfied with your preview:

1. Open the Sidekick
2. Click **Publish**
3. Your content is now live on the site

## Understanding the Workflow

```
Edit → Preview → Review → Publish
```

| Stage | What Happens |
|-------|--------------|
| **Edit** | Make changes in Document Authoring |
| **Preview** | See changes on the preview environment (not public) |
| **Review** | Check your work, get approvals if needed |
| **Publish** | Content goes live on the production site |

## Key Concepts

### Pages and URLs

Your document's location and name determine its URL:

| Document Location | URL                        |
|-------------------|----------------------------|
| `/en/about` | `assets.coke.com/en/about` |
| `/en/help/faq` | `assets.coke.com/en/help/faq` |

### Sections

Use section breaks to divide your page into distinct areas. Each section can have its own background and styling.

To create a section break:
- Type `---` (three hyphens) on its own line, or
- Insert a horizontal line

Learn more in [Page Structure](page-structure.md).

### Metadata

Every page needs metadata for SEO and site functionality. Metadata is added using a special table at the end of your document.

Learn more in [Page Structure](page-structure.md).

## Common Tasks

### Editing an Existing Page

1. Navigate to the page in Document Authoring
2. Open the document
3. Make your changes
4. Preview to verify
5. Publish when ready

### Unpublishing a Page

1. Delete the document from Document Authoring
2. Open the Sidekick on the deleted page's URL
3. Click **Unpublish**

> **Note:** You must delete the document before unpublishing. The page will remain live until you complete both steps.

## Next Steps

- [Page Structure](page-structure.md) - Learn about sections and metadata
- [Blocks Overview](blocks/README.md) - Explore available content blocks
- [Images and Media](images-and-media.md) - Working with images

## Resources

- [Document Authoring Documentation](https://docs.da.live/)
- [AEM Edge Delivery Services](https://www.aem.live/docs/)


---


# Page Structure

This guide explains how to organize content on your pages using sections, metadata, and default content.

## Page Anatomy

A typical KO Assets page consists of:

```
┌─────────────────────────────────┐
│           Header                │  ← Automatic (from header block)
├─────────────────────────────────┤
│                                 │
│         Section 1               │  ← Your content
│    (Hero, intro text, etc.)     │
│                                 │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← Section break (---)
│                                 │
│         Section 2               │
│   (Cards, carousel, content)    │
│                                 │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤  ← Section break (---)
│                                 │
│         Section 3               │
│      (More content...)          │
│                                 │
├─────────────────────────────────┤
│        Page Metadata            │  ← Required metadata table
├─────────────────────────────────┤
│           Footer                │  ← Automatic (from footer block)
└─────────────────────────────────┘
```

## Sections

Sections divide your page into distinct content areas. Each section can have its own styling and background.

### Creating Sections

To create a section break, add a horizontal line in your document:

- Type `---` (three hyphens) on its own line, or
- Insert a horizontal line from the menu

Everything between section breaks becomes one section.

### Section Metadata

You can style sections by adding a **Section Metadata** table at the end of the section (before the section break).

| Section Metadata |                |
|------------------|----------------|
| style            | light          |

#### Available Section Styles

| Style | Description |
|-------|-------------|
| `light` | Light gray background |
| `highlight` | Same as light - light gray background |
| `light-blue` | Sky blue background |
| `dark` | Dark background with white text for headings |
| `center` | Centers the content |

#### Example: Section with Light Background

```
## Our Services

We offer a wide range of digital assets...

| Section Metadata |       |
|------------------|-------|
| style            | light |

---
```

#### Combining Styles

You can apply multiple styles by separating them with commas:

| Section Metadata |              |
|------------------|--------------|
| style            | light, center |

## Default Content

Default content is any text, images, or formatting that isn't inside a block. It renders directly as HTML.

### Supported Default Content

| Element | How to Create |
|---------|---------------|
| Headings | Use heading styles (Heading 1, Heading 2, etc.) |
| Paragraphs | Regular text |
| Bold text | Select text and apply bold |
| Italic text | Select text and apply italic |
| Links | Select text and add hyperlink |
| Bulleted lists | Use bullet list formatting |
| Numbered lists | Use numbered list formatting |
| Images | Insert image into document |

### Default Content vs Blocks

| Use Default Content When... | Use a Block When... |
|-----------------------------|---------------------|
| Simple text paragraphs | Structured layouts (cards, carousels) |
| Single images with captions | Image galleries or carousels |
| Basic lists | Interactive elements (tabs, accordion) |
| Headings and body copy | Special functionality needed |

## Page Metadata

Every page requires a **Metadata** table at the end of the document. This controls SEO, social sharing, and page behavior.

### Required Metadata Table

Add this table at the very end of your document:

| Metadata    |                              |
|-------------|------------------------------|
| title       | Your Page Title              |
| description | A brief description of the page for search engines |
| image       | /path/to/social-share-image.jpg |

### Common Metadata Properties

| Property | Purpose | Example |
|----------|---------|---------|
| `title` | Page title (browser tab, search results) | `About KO Assets` |
| `description` | SEO description (search result snippet) | `Learn about our digital asset platform` |
| `image` | Social sharing image (og:image) | `/images/about-hero.jpg` |

### Metadata Best Practices

- **Title**: Keep under 60 characters
- **Description**: Keep between 150-160 characters
- **Image**: Use images at least 1200x630 pixels for social sharing

## Complete Page Example

Here's an example of a complete page structure:

```
[Hero Block with background image]

---

## Welcome to KO Assets

Access thousands of brand-approved digital assets for your marketing needs.

| Section Metadata |       |
|------------------|-------|
| style            | light |

---

## Featured Collections

[Cards Block showing featured collections]

---

## Need Help?

Contact our support team for assistance with finding the right assets.

[Button or link to contact page]

| Section Metadata |            |
|------------------|------------|
| style            | light-blue |

---

| Metadata    |                                        |
|-------------|----------------------------------------|
| title       | KO Assets - Digital Asset Portal       |
| description | Access brand-approved digital assets for marketing |
| image       | /images/home-social.jpg                |
```

## Tips

1. **Start with a hero** - Most pages benefit from a Hero block at the top
2. **Use sections for visual rhythm** - Alternate between styled and unstyled sections
3. **Keep sections focused** - Each section should have one main purpose
4. **Don't over-style** - Too many different section styles can look chaotic
5. **Always add metadata** - Every page needs at minimum a title and description

## Next Steps

- [Blocks Overview](blocks/README.md) - Learn about available blocks
- [Hero Block](blocks/hero.md) - Create impactful page headers
- [Images and Media](images-and-media.md) - Working with images


---


# Blocks Overview

Blocks are reusable content components that provide structured layouts and functionality beyond simple text and images.

## What is a Block?

A block is a special content element created using a table in your document. The table tells the system what type of block to render and what content to display.

Examples of blocks:
- **Cards** - Grid of content cards with images
- **Carousel** - Rotating content slider
- **Accordion** - Expandable/collapsible sections
- **Tabs** - Tabbed content panels

## Creating a Block

Every block follows the same basic pattern:

### Step 1: Insert a Table

Insert a table into your document where you want the block to appear.

### Step 2: Add the Block Name

In the first row, type the block name (e.g., `Cards`, `Accordion`, `Tabs`).

### Step 3: Add Content

Fill in the remaining rows with your content. Each block has its own content structure.

### Basic Block Structure

```
┌─────────────────────────────────┐
│          Block Name             │  ← First row: block name (merged cells)
├─────────────────┬───────────────┤
│    Content      │    Content    │  ← Content rows
├─────────────────┼───────────────┤
│    Content      │    Content    │
└─────────────────┴───────────────┘
```

### Example: Simple Cards Block

| Cards |  |
|-------|--|
| image.jpg | Card Title |
| image-2.jpg | Another Title |

This creates a grid of cards with images and titles.

## Block Variants

Many blocks support **variants** that modify their appearance or behavior. Add the variant name in parentheses after the block name.

| Cards (highlights) |  |
|--------------------|--|
| image.jpg | Featured Item |

Common variant patterns:
- `Block (variant)` - Single variant
- `Block (variant1, variant2)` - Multiple variants

Check each block's documentation for available variants.

## Block Content Types

Blocks can contain different types of content in their cells:

| Content Type | Description | Example |
|--------------|-------------|---------|
| Text | Plain text or formatted text | Paragraphs, headings, lists |
| Images | Pictures inserted into cells | Product photos, icons |
| Links | Hyperlinked text or images | Navigation links, CTAs |
| Mixed | Combination of above | Image with caption and link |

## Available Blocks

### Layout Blocks

| Block | Purpose | Documentation |
|-------|---------|---------------|
| [Cards](cards.md) | Grid of content cards | [View](cards.md) |
| [Carousel](carousel.md) | Rotating content slider | [View](carousel.md) |
| [Team Cards](team-cards.md) | Team member display grid | [View](team-cards.md) |

### Interactive Blocks

| Block | Purpose | Documentation |
|-------|---------|---------------|
| [Accordion](accordion.md) | Expandable/collapsible sections | [View](accordion.md) |
| [Tabs](tabs.md) | Tabbed content panels | [View](tabs.md) |
| [FAQ](faq.md) | Tabbed accordion for FAQs | [View](faq.md) |

### Utility Blocks

| Block | Purpose | Documentation |
|-------|---------|---------------|
| [Note](note.md) | Callout boxes for important info | [View](note.md) |
| [Fragment](fragment.md) | Include content from other pages | [View](fragment.md) |

### Patterns (Default Content)

| Pattern | Purpose | Documentation |
|---------|---------|---------------|
| [Buttons](buttons.md) | Call-to-action links | [View](buttons.md) |

## Tips for Working with Blocks

### Do

- **Check the documentation** for each block before using it
- **Preview your page** after adding blocks to verify they render correctly
- **Use the right block** for your content type (don't force content into the wrong block)
- **Keep content concise** - blocks work best with focused content

### Don't

- **Don't nest blocks** inside other blocks (unless specifically documented)
- **Don't leave the block name row empty** - it must contain the block name
- **Don't add extra rows** beyond what the block expects
- **Don't use blocks for simple content** - use default content instead

## Troubleshooting

### Block Not Rendering

If your block appears as a plain table instead of the expected component:

1. **Check the block name** - Spelling must be exact (case-insensitive)
2. **Check the table structure** - First row must contain only the block name
3. **Preview the page** - Changes may need a preview refresh

### Content Not Appearing

If some content is missing from your block:

1. **Check cell placement** - Content must be in the correct cells
2. **Check for merged cells** - Only merge the header row
3. **Verify content type** - Some blocks only accept certain content types

### Styling Issues

If the block looks different than expected:

1. **Check for variants** - You may need to add a variant for the desired style
2. **Check section styling** - Section Metadata may affect block appearance
3. **Try a different block** - The block may not be designed for your use case

## Next Steps

Explore individual block documentation:

- [Cards](cards.md) - Display content in card format
- [Carousel](carousel.md) - Showcase featured content
- [Accordion](accordion.md) - Organize content in expandable sections
- [Tabs](tabs.md) - Create tabbed content panels
- [FAQ](faq.md) - Build categorized FAQ pages
- [Note](note.md) - Add callout boxes
- [Fragment](fragment.md) - Reuse content across pages
- [Team Cards](team-cards.md) - Display team members
- [Buttons](buttons.md) - Style call-to-action links


---


# Accordion

Creates expandable/collapsible sections for organizing content. Each item has a clickable label that reveals or hides the associated content.

## When to Use

- FAQ sections with questions and answers
- Long content that benefits from progressive disclosure
- Help documentation with expandable topics
- Any content where users may only need to see specific sections

## Authoring

### Basic Structure

| accordion |  |
|-----------|--|
| Label 1   | Content for item 1 |
| Label 2   | Content for item 2 |
| Label 3   | Content for item 3 |

### Content Structure

| Column | Purpose |
|--------|---------|
| First column | The clickable label/question (always visible) |
| Second column | The expandable content/answer (hidden until clicked) |

Each row becomes one accordion item. Add as many rows as needed.

### What You Can Include

**In the label (first column):**
- Plain text (recommended)
- Short phrases or questions

**In the body (second column):**
- Paragraphs of text
- Links
- Lists
- Images
- Multiple elements combined

## Examples

### FAQ Example

| accordion |  |
|-----------|--|
| What is KO Assets? | KO Assets is the digital asset management platform for Coca-Cola, providing access to brand-approved marketing materials. |
| How do I download assets? | Use the search to find assets, add them to your cart, then proceed to download. You may need to specify intended use for certain assets. |
| Who do I contact for help? | Email assetmanagers@coca-cola.com or submit a Support Portal ticket. |

### Help Section Example

| accordion |  |
|-----------|--|
| Getting Started | Welcome to KO Assets! Start by using the search bar to find the content you need. Use filters to narrow down results by brand, campaign, or asset type. |
| Account Settings | Access your account settings by clicking on "My Account" in the header. Here you can update your preferences and view your download history. |
| Troubleshooting | If you're having issues, try clearing your browser cache and logging in again. For persistent problems, contact support. |

## Behavior

- **Collapsed by default** - All items start closed
- **Click to expand** - Click any label to reveal its content
- **Click to collapse** - Click an open label to hide its content
- **Multiple open** - Multiple items can be open simultaneously
- **Visual indicator** - Arrow icon shows expand/collapse state

## Live Examples

- Welcome page accordion: [da.live/edit#/.../public/welcome](https://da.live/edit#/the-coca-cola-company/koassets/public/welcome)
- FAQ page: [da.live/edit#/.../help/faq](https://da.live/edit#/the-coca-cola-company/koassets/help/faq)

## Tips

- Keep labels concise and scannable
- Front-load important words in labels (users scan the left side)
- Write labels as questions for FAQ-style content
- Don't nest accordions inside other accordions
- Consider using the [FAQ block](faq.md) if you need tabs with accordions

## Related

- [FAQ](faq.md) - Combines tabs with accordions for categorized FAQs
- [Tabs](tabs.md) - Alternative for content that users need to compare


---


# Cards

Displays content in a grid of card layouts with images and text. Cards automatically become clickable when they contain links.

## When to Use

- Showcasing collections, brands, or categories
- Navigation grids linking to different sections
- Feature highlights with images
- Content teasers with thumbnails

## Authoring

### Basic Structure

| cards |  |
|-------|--|
| image.jpg | Card Title |
| image-2.jpg | Another Card Title |

### Content Structure

| Column | Purpose |
|--------|---------|
| First column | Card image |
| Second column | Card title/text (can include a link) |

Each row becomes one card. Add as many rows as needed.

### Making Cards Clickable

To make a card clickable, add a link to the text in the second column:

| cards |  |
|-------|--|
| image.jpg | [Card Title](/path/to/page) |

The entire card becomes clickable, not just the text.

## Variants

| Variant | Description |
|---------|-------------|
| (default) | Horizontal cards with image on left, gray background |
| `(highlights)` | Vertical cards with image on top, dark background, red hover effect |

## Examples

### Basic Cards

![cards-basic.png](..%2Fimages%2Fcards-basic.png)

### Highlights Variant

Use for featured content with a more prominent visual style:

![cards-highlights.png](..%2Fimages%2Fcards-highlights.png)


## Live Examples

- Home page (both variants): [da.live/edit#/.../index](https://da.live/edit#/the-coca-cola-company/koassets/en/index)

## Tips

- Use consistent image dimensions for a uniform look
- Keep card titles short (1-2 lines)
- Always add links to make cards useful for navigation
- Use **highlights** variant for key brands or featured content
- Use **default** variant for secondary navigation or resource lists
- Images are automatically optimized for web delivery

## Related

- [Carousel](carousel.md) - For scrollable card-like content
- [Team Cards](team-cards.md) - Specialized cards for team members


---


# Carousel

Creates a horizontal scrolling carousel with navigation controls for showcasing featured content. Cards display an image on top with a title below on a dark background.

## When to Use

- Featuring new or highlighted content ("What's New")
- Showcasing multiple items in limited space
- Campaign or collection highlights
- Content that benefits from visual browsing

## Authoring

### Basic Structure

| carousel |  |
|----------|--|
| image1.jpg | Title 1 |
| image2.jpg | Title 2 |
| image3.jpg | Title 3 |
| image4.jpg | Title 4 |

### Content Structure

| Column | Purpose |
|--------|---------|
| First column | Slide image |
| Second column | Slide title (can include a link) |

Each row becomes one carousel slide. Add as many rows as needed.

### Making Slides Clickable

To make a slide clickable, add a link to the title:

| carousel |  |
|----------|--|
| campaign.jpg | [Holiday Campaign 2025](/campaigns/holiday-2025) |

The entire slide becomes clickable and opens the link in a new tab.

## Examples

### What's New Carousel

| carousel |  |
|----------|--|
| lemonade.jpg | [Minute Maid Lemonade](/campaigns/minute-maid) |
| artd.jpg | [ARTD Portfolio](/campaigns/artd) |
| fifa.jpg | [FIFA 26 Slim Can](/campaigns/fifa) |
| holiday.jpg | [Road to FIFA](/campaigns/road-to-fifa) |

## Live Examples

- Home page carousel: [da.live/edit#/.../index](https://da.live/edit#/the-coca-cola-company/koassets/en/index)

## Tips

- Use high-quality images with consistent dimensions
- Keep titles short (1-2 lines work best)
- Add at least 4-5 slides to make the carousel useful
- Always include links to make slides actionable
- Consider the mobile experience where only 1 slide shows at a time
- Images are automatically optimized for web delivery

## Related

- [Cards](cards.md) - For non-scrolling grid layouts
- [Cards (highlights)](cards.md#highlights-variant) - Similar visual style without scrolling


---


# Tabs

Creates a tabbed interface for organizing content into multiple panels. Users click tab buttons to switch between content sections.

## When to Use

- Organizing related content into categories
- Reducing page length by hiding content until needed
- Comparing different options or categories
- Content stores with multiple brand sections

## Authoring

### Basic Structure

| tabs |  |
|------|--|
| Tab 1 Title | Content for tab 1 |
| Tab 2 Title | Content for tab 2 |
| Tab 3 Title | Content for tab 3 |

### Content Structure

| Column | Purpose |
|--------|---------|
| First column | Tab button label |
| Second column | Tab panel content |

Each row becomes one tab. Add as many rows as needed.

### Using Fragments in Tabs

You can load content from other pages (fragments) instead of inline content. This is useful for reusable content or complex tab panels.

Use the special syntax `((fragment)):` followed by a link to the fragment:

| tabs |  |
|------|--|
| Coca-Cola | ((fragment)): [/fragments/coca-cola](/fragments/coca-cola) |
| Sprite | ((fragment)): [/fragments/sprite](/fragments/sprite) |
| Fanta | ((fragment)): [/fragments/fanta](/fragments/fanta) |

## Examples

### Simple Tabs

| tabs |  |
|------|--|
| Overview | This product line includes our flagship beverages available worldwide. |
| Features | Key features include refreshing taste, iconic branding, and global availability. |
| Downloads | Access product images, logos, and marketing materials in the sections below. |

### Brand Tabs with Fragments

| tabs |  |
|------|--|
| Coca-Cola | ((fragment)): [/fragments/coca-cola](/fragments/coca-cola) |
| Fanta | ((fragment)): [/fragments/fanta](/fragments/fanta) |

### Content with Cards Inside Tabs

Tab content can include other blocks. Create the tab content with cards:

| tabs |  |
|------|--|
| Images | Browse our image library for this campaign. [View all images](/search?type=images) |
| Videos | Find video assets and b-roll footage. [View all videos](/search?type=videos) |


## Live Examples

- Content Stores page: [da.live/edit#/.../all-content-stores](https://da.live/edit#/the-coca-cola-company/koassets/all-content-stores)

## Tips

- Keep tab labels short (1-3 words)
- Use consistent naming across tabs
- Don't create too many tabs (3-5 is ideal)
- First tab should contain the most important/common content
- Use fragments for complex or reusable tab content
- Tab content can include other blocks, text, images, and links

## Fragment Syntax

The fragment syntax must be exact:

```
((fragment)): [link text](/path/to/fragment)
```

- `((fragment)):` - Required prefix (with colon)
- Space after the colon
- Standard link in brackets and parentheses

## Related

- [Accordion](accordion.md) - For expandable/collapsible sections
- [FAQ](faq.md) - Combines tabs with accordions
- [Fragment](fragment.md) - For reusable content blocks


---


# FAQ

Creates a tabbed interface with accordion items inside each tab. Designed specifically for organizing Frequently Asked Questions into categories.

## When to Use

- FAQ pages with multiple categories
- Help documentation organized by topic
- Any Q&A content that needs both categorization (tabs) and expandable items (accordion)

## Authoring

### Basic Structure

| faq |  |
|-----|--|
| Tab 1 Title |  |
| Question 1 | Answer 1 |
| Question 2 | Answer 2 |
| Tab 2 Title |  |
| Question 3 | Answer 3 |
| Question 4 | Answer 4 |

### Content Structure

| Row Type | First Column | Second Column |
|----------|--------------|---------------|
| Tab header | Tab title | Empty (or leave blank) |
| FAQ item | Question | Answer |

**Key rule:** Rows with only one cell (or empty second cell) become tab headers. Rows with two cells become accordion items under the current tab.

## Examples

### Complete FAQ Example

| faq |  |
|-----|--|
| Search |  |
| Q1: I was expecting to see more assets than I am. Is it possible to see all assets? | A: Not all assets are visible to all KO Assets users due to legal, brand, or trademark restrictions. Your user profile may only grant access to assets you are permitted to view. |
| Q2: What do I do if the asset I want to download or order is not on the site? | A: Please contact assetmanagers@coca-cola.com and we'll help you locate the asset. |
| Q3: Where can I find older or historical assets? | A: Historical assets may be archived. Contact support for assistance locating older content. |
| Download |  |
| Q1: How do I download multiple assets at once? | A: Add assets to your cart, then proceed to download. You can select multiple renditions and formats. |
| Q2: Why do some assets require approval? | A: Certain assets have usage restrictions. The approval process ensures proper rights management. |

## Live Examples

- FAQ page: [da.live/edit#/.../help/faq](https://da.live/edit#/the-coca-cola-company/koassets/en/help/faq)

## Related

- [Accordion](accordion.md) - Simple expandable sections without tabs
- [Tabs](tabs.md) - Tabbed content without built-in accordion


---


# Note

Creates styled callout boxes with icons for highlighting important information, tips, or warnings.

## When to Use

- Drawing attention to important information
- Providing helpful tips or guidance
- Warning users about potential issues
- Highlighting prerequisites or requirements

## Authoring

### Basic Structure

| note |
|------|
| Your message here |

### With a Heading

| note |
|------|
| **Important** |
| Please read the following instructions carefully before proceeding. |

## Variants

| Variant | Icon | Description |
|---------|------|-------------|
| (default) | Info | Blue background with info icon (default style) |
| `(info)` | Info | Same as default - informational message |
| `(warning)` | Warning | Warning icon for cautionary messages |
| `(error)` | Error | Error icon for critical information |
| `(success)` | Success | Success icon for positive confirmations |
| `(no-icon)` | None | Removes the icon entirely |

## Examples

### Default Info Note

| note |
|------|
| Explore tabs below to access various content |

### Info Note (Explicit)

| note (info) |
|-------------|
| Need help? Don't hesitate to reach out to us at assetmanagers@coca-cola.com |

### Warning Note

| note (warning) |
|----------------|
| Some assets may require additional rights approval before use. |

### Error Note

| note (error) |
|--------------|
| This content store is no longer available. Please contact support. |

### Success Note

| note (success) |
|----------------|
| Your request has been submitted successfully. |

### Note Without Icon

| note (no-icon) |
|----------------|
| This is a simple callout without an icon. |

### Note with Heading and Content

| note (info) |
|-------------|
| **Before You Begin** |
| Make sure you have the necessary permissions to download assets from this content store. |

## Live Examples

- Content Stores page: [da.live/edit#/.../all-content-stores](https://da.live/edit#/the-coca-cola-company/koassets/en/help/meet-the-team)

## Tips

- Keep note content concise and scannable
- Use the appropriate variant for the message type
- Don't overuse notes - they lose impact if every section has one
- Use `(no-icon)` for subtle callouts that don't need visual emphasis
- Notes work well at the top of sections to set context

## Related

- [Accordion](accordion.md) - For expandable help content
- [Fragment](fragment.md) - For reusable note content across pages


---


# Fragment

Includes content from another page as a reusable component. Fragments allow you to maintain content in one place and use it across multiple pages.

## When to Use

- Reusing the same content on multiple pages
- Maintaining consistent messaging across the site
- Creating modular content that can be updated centrally
- Building complex pages from smaller, manageable pieces

## Authoring

### Basic Structure

| fragment |
|----------|
| [Fragment Name](/path/to/fragment) |

The fragment block contains a single link to the fragment page.

## Examples

### Including a Disclaimer Fragment

| fragment |
|----------|
| [Legal Disclaimer](/fragments/legal-disclaimer) |

### Including Brand Guidelines

| fragment |
|----------|
| [Brand Guidelines](/fragments/brand-guidelines) |

### Including Contact Information

| fragment |
|----------|
| [Contact Support](/fragments/contact-support) |

## Creating Fragment Pages

Fragments are regular pages stored in a dedicated location (typically `/fragments/`). To create a fragment:

1. Create a new page in the `/fragments/` folder
2. Add the content you want to reuse
3. Preview and publish the fragment page
4. Reference it using the Fragment block on other pages

### Fragment Page Structure

Fragment pages are authored like any other page:

```
Your reusable content here.

This can include:
- Text and headings
- Images
- Other blocks (cards, accordions, etc.)
- Links

---

| Metadata |  |
|----------|--|
| robots   | noindex |
```

> **Tip:** Add `robots: noindex` to fragment metadata to prevent them from appearing in search results.

## Behavior

- Fragment content replaces the Fragment block when the page loads
- Section styling from the fragment is inherited by the containing section
- Fragments load asynchronously (the page may render before fragments appear)
- Fragments can contain any content, including other blocks

## Common Fragment Locations

| Location | Purpose |
|----------|---------|
| `/fragments/` | General reusable content |
| `/fragments/disclaimers/` | Legal and compliance text |
| `/fragments/brand/` | Brand-specific content |

## Tips

- Keep fragments focused on a single purpose
- Use descriptive names for fragment pages
- Store fragments in organized folders
- Remember to publish fragments after editing them
- Test fragments on multiple pages after updates
- Add `robots: noindex` metadata to prevent search indexing

## Fragment vs Copy-Paste

| Aspect | Fragment | Copy-Paste |
|--------|----------|------------|
| Updates | Change once, updates everywhere | Must update each page |
| Consistency | Guaranteed identical | May drift over time |
| Maintenance | Lower effort | Higher effort |
| Best for | Repeated content | One-time use |

## Using Fragments in Tabs

Fragments can be loaded inside tabs using special syntax. See [Tabs](tabs.md) for details:

```
((fragment)): [link text](/path/to/fragment)
```

## Related

- [Tabs](tabs.md) - Can load fragments in tab panels
- [Note](note.md) - For simple callout content (doesn't need a fragment)


---


# Team Cards

Creates a grid of cards designed for displaying team members with photos, names, and job titles.

## When to Use

- "Meet the Team" pages
- Staff directories
- Department or group member listings
- Any content featuring people with photos and titles

## Authoring

### Basic Structure

| team-cards |                  |
|------------|------------------|
| photo1.jpg | Name, Job Title  |
| photo2.jpg | Name, Job Title  |

### With Section Title

Add a single-cell row at the top to create a section title:

| team-cards            |                  |
|-----------------------|------------------|
| TCCC KO Assets Team   |
| photo1.jpg            | Name, Job Title  |
| photo2.jpg            | Name, Job Title  |

### Content Structure

| Row Type | First Column | Second Column |
|----------|--------------|---------------|
| Title (optional) | Section title | Empty |
| Team member | Photo | Name and job title |

Each team member uses one row with:
- **First column:** Team member photo
- **Second column:** Name (as heading) and job title (as paragraph)

## Examples

### Simple Team Grid

![team-cards-1.png](..%2Fimages%2Fteam-cards-1.png)

### Team Section with Title

![team-cards-2.png](..%2Fimages%2Fteam-cards-2.png)


## Live Examples

- Meet the Team page: [da.live/edit#/.../help/meet-the-team](https://da.live/edit#/the-coca-cola-company/koassets/en/help/meet-the-team)

## Tips

- Use square or near-square photos for best results
- Keep job titles concise (1-2 lines)
- Use consistent photo styles (background, lighting, cropping)
- Photos are automatically optimized for web delivery
- Add a title row to create a labeled section
- Consider grouping large teams into multiple team-cards blocks by department


## Related

- [Cards](cards.md) - For general content cards


---


# Buttons

Buttons are created using default content (not a block). A link placed on its own line automatically becomes a styled button.

## When to Use

- Call-to-action links (Sign In, Register, Submit)
- Navigation to important pages
- Download or action triggers
- Any link that needs visual prominence

## Authoring

Buttons are created by placing a link on its own line (in its own paragraph).

### Primary Button (Filled)

Place a bold link on its own line:

```
**[SIGN IN](https://example.com/signin)**
```

Result: Red filled button with white text

### Secondary Button (Outlined)

Place an italic link on its own line:

```
*[REGISTER](https://example.com/register)*
```

Result: White button with gray border

### Default Button

Place a plain link on its own line:

```
[Learn More](https://example.com/learn)
```

Result: Red filled button (same as primary)

## Examples

### Sign In and Register Buttons

```
**[SIGN IN](https://sso.example.com/login)**

*[REGISTER](https://example.com/register)*
```

### Call-to-Action Button

```
**[Content Store Request Form](https://example.com/request-form)**
```

### Multiple Buttons

Place each link on its own line:

```
**[Download Assets](/download)**

*[View Documentation](/docs)*

[Contact Support](/support)
```

## Button Styles

| Style | How to Create | Appearance |
|-------|---------------|------------|
| Primary | `**[Text](url)**` (bold) | Red filled, white text |
| Secondary | `*[Text](url)*` (italic) | White, gray border |
| Default | `[Text](url)` (plain) | Red filled, white text |


## Live Examples

- Welcome page buttons: [da.live/edit#/.../public/welcome](https://da.live/edit#/the-coca-cola-company/koassets/public/welcome)
- Content Stores page: [da.live/edit#/.../all-content-stores](https://da.live/edit#/the-coca-cola-company/koassets/all-content-stores)


## Related

- [Cards](cards.md) - For navigation with images


---


# Images and Media

This guide covers how to add and optimize images in your KO Assets pages.

## Adding Images

### In Default Content

Simply insert an image into your document where you want it to appear:

1. Place your cursor in the document
2. Insert an image (drag and drop, or use the insert menu)
3. The image appears inline with your content

### In Blocks

Most blocks accept images in specific cells. Refer to each block's documentation for image placement:

- **Cards** - First column contains the image
- **Carousel** - First column contains the image
- **Team Cards** - First column contains the photo

## Image Optimization

Images are automatically optimized when your page is published:

| Optimization | What Happens |
|--------------|--------------|
| Format | Converted to WebP for modern browsers (with fallback) |
| Sizing | Multiple sizes generated for different screen widths |
| Loading | Lazy loading applied (images load as user scrolls) |
| Quality | Optimized for web delivery |

You don't need to manually resize or compress images - the system handles this automatically.

## Alt Text

Alt text (alternative text) describes images for:
- Screen readers (accessibility)
- Search engines (SEO)
- Fallback when images fail to load

### Adding Alt Text

In Document Authoring, alt text is typically set through the image properties or by adding a caption.


### File Formats

| Format | Best For |
|--------|----------|
| JPG/JPEG | Photos, complex images |
| PNG | Graphics with transparency |
| SVG | Icons, logos (vector) |
| WebP | Automatically generated |

> **Note:** Upload JPG or PNG files. The system automatically creates WebP versions for browsers that support it.

### File Size

- Keep original files under 5MB for faster uploads
- The system optimizes files, but starting smaller helps
- Very large files may slow down the authoring experience

## Icons

Icons are handled separately from regular images. They're stored in the `/icons/` folder and referenced by name.

To use an icon inline, you typically use a special syntax depending on the context. Most icons are added automatically by blocks (like the info icon in Note blocks).

## Background Images

Sections can have background images using Section Metadata:

| Section Metadata |  |
|------------------|--|
| Background image | your-image.jpg |

The image will cover the entire section background.

## Image Best Practices

### Do

- **Use high-quality source images** - Optimization works best with good originals
- **Add meaningful alt text** - Improves accessibility and SEO
- **Use consistent aspect ratios** - Especially in grids (Cards, Carousel)
- **Test on mobile** - Ensure images look good on small screens
- **Use appropriate file formats** - JPG for photos, PNG for graphics

### Don't

- **Don't use text in images** - Text should be actual text for accessibility
- **Don't upload huge files unnecessarily** - Keep under 5MB when possible
- **Don't skip alt text** - Every meaningful image needs a description
- **Don't use images for layout** - Use blocks and sections instead
- **Don't hotlink external images** - Upload images to Document Authoring

## Troubleshooting

### Image Not Displaying

1. **Check the file** - Ensure it uploaded successfully
2. **Preview the page** - Images may not show in edit mode
3. **Check file format** - Use JPG, PNG, or WebP
4. **Verify placement** - Ensure image is in the correct cell for blocks

### Image Looks Blurry

1. **Check source resolution** - Original may be too small
2. **Upload a larger version** - At least 750px wide for most uses
3. **Check the block** - Some blocks have specific size requirements

### Image Too Large/Small

- Images automatically scale to fit their container
- For specific sizing, work with your development team
- Most blocks handle sizing automatically

## Related

- [Cards](blocks/cards.md) - Using images in card layouts
- [Carousel](blocks/carousel.md) - Using images in carousels
- [Team Cards](blocks/team-cards.md) - Using photos for team members
- [Page Structure](page-structure.md) - Background images in sections


---


# Localization

This guide explains how to create and manage content for multiple languages in KO Assets.

## Supported Languages

KO Assets currently supports:

| Language | Code | URL Path |
|----------|------|----------|
| English | `en` | `/en/...` |
| Japanese | `ja` | `/ja/...` |

## How Localization Works

### URL-Based Locale

Each language has its own URL path prefix:

| Language | Example URL |
|----------|-------------|
| English | `assets.coke.com/en/help/faq` |
| Japanese | `assets.coke.com/ja/help/faq` |

### Content Structure

Content for each language lives in separate folders in Document Authoring:

```
/
├── en/
│   ├── index
│   ├── help/
│   │   ├── faq
│   │   └── meet-the-team
│   └── ...
├── ja/
│   ├── index
│   ├── help/
│   │   ├── faq
│   │   └── meet-the-team
│   └── ...
└── (shared resources)
```

## Creating Localized Content

### Option 1: Copy and Translate

1. Navigate to the source language folder (e.g., `/en/help/faq`)
2. Copy the page to the target language folder (e.g., `/ja/help/faq`)
3. Translate the content
4. Preview and publish

### Option 2: Create New

1. Navigate to the target language folder
2. Create a new page
3. Author content in that language
4. Preview and publish

## Best Practices

### Content Consistency

- **Mirror folder structure** - Keep the same page hierarchy across languages
- **Use same page names** - Makes navigation predictable (e.g., `/en/help/faq` and `/ja/help/faq`)
- **Update all languages** - When content changes, update all localized versions

### What to Localize

| Localize | Keep Original |
|----------|---------------|
| Body text | Image file names |
| Headings | URLs to external resources |
| Button text | Technical identifiers |
| Alt text for images | Block names (e.g., "cards", "tabs") |
| Page metadata | Fragment paths |

### Block Names

Block names are **not translated**. Always use English block names:

| Correct | Incorrect |
|---------|-----------|
| `cards` | `カード` |
| `accordion` | `アコーディオン` |
| `tabs` | `タブ` |

## Shared Resources

Some content is shared across all languages:

- **Navigation** (`/nav`) - May need locale-specific versions
- **Footer** (`/footer`) - May need locale-specific versions
- **Fragments** - Create locale-specific fragments when needed

### Locale-Specific Navigation

If you need different navigation for different languages:

1. Create `/en/nav` for English navigation
2. Create `/ja/nav` for Japanese navigation
3. Each page in that locale will use its respective navigation

## Links Between Languages

### Internal Links

When linking between pages, consider whether the link should:

1. **Stay in current locale** - Use relative paths: `/help/faq`
2. **Switch locale** - Use explicit paths: `/ja/help/faq`

The system automatically adds the locale prefix to relative paths.

### Language Switcher

Users can switch languages using the language selector in the header. Their preference is saved for future visits.

## Metadata for Localized Pages

Each localized page should have appropriate metadata:

| Metadata | English Example | Japanese Example |
|----------|-----------------|------------------|
| title | Frequently Asked Questions | よくある質問 |
| description | Find answers to common questions | 一般的な質問への回答 |

## Testing Localized Content

1. **Preview each language** - Ensure content displays correctly
2. **Test navigation** - Verify links work within each locale
3. **Check the language switcher** - Confirm switching languages works
4. **Review on mobile** - Some languages may wrap differently

## Troubleshooting

### Content Not Showing in Correct Language

1. **Check the URL** - Ensure the locale prefix is correct (`/en/` vs `/ja/`)
2. **Check folder location** - Content must be in the correct locale folder
3. **Verify page exists** - The page must exist in that locale folder

### Links Going to Wrong Language

1. **Check link paths** - Relative links inherit the current locale
2. **Use explicit paths** - For cross-locale links, include the full path with locale

### Navigation Issues

1. **Check for locale-specific nav** - May need separate nav files per locale
2. **Verify nav file location** - Should be at `/en/nav` or `/ja/nav` if locale-specific

## Tips

- Start with English content, then translate to other languages
- Keep a translation checklist for each page
- Review translations with native speakers
- Test the full user journey in each language

## Related

- [Page Structure](page-structure.md) - Setting up page metadata
- [Fragment](blocks/fragment.md) - Creating reusable localized content
- [Getting Started](getting-started.md) - Document Authoring basics


---


# Best Practices

This guide covers tips and recommendations for effective content authoring in KO Assets.

## General Authoring

### Do

- **Preview before publishing** - Always check your changes in preview mode
- **Use descriptive page names** - Page names become URLs (`about-us` not `page1`)
- **Keep content focused** - One main topic per page
- **Write for scanning** - Use headings, lists, and short paragraphs
- **Test on mobile** - Many users access KO Assets on smaller screens

### Don't

- **Don't publish without previewing** - Catch issues before they go live
- **Don't use special characters in page names** - Stick to lowercase letters and hyphens
- **Don't create overly long pages** - Break content into multiple pages if needed
- **Don't forget metadata** - Every page needs title and description

## Page Structure

### Section Organization

- **Start with the most important content** - Users may not scroll down
- **Use sections to create visual breaks** - Alternate between styled and unstyled sections
- **Keep sections focused** - Each section should have one purpose
- **Don't overuse styled sections** - Too many backgrounds can look chaotic

### Metadata

| Always Include | Recommended |
|----------------|-------------|
| `title` | `description` |

- Keep titles under 60 characters
- Keep descriptions between 150-160 characters
- Make titles unique and descriptive

## Working with Blocks

### Choosing the Right Block

| Content Type | Recommended Block |
|--------------|-------------------|
| Expandable Q&A | [Accordion](blocks/accordion.md) |
| Categorized FAQ | [FAQ](blocks/faq.md) |
| Image grid navigation | [Cards](blocks/cards.md) |
| Featured content slider | [Carousel](blocks/carousel.md) |
| Categorized content | [Tabs](blocks/tabs.md) |
| Important callouts | [Note](blocks/note.md) |
| Reusable content | [Fragment](blocks/fragment.md) |
| Team members | [Team Cards](blocks/team-cards.md) |

### Block Tips

- **Check block documentation first** - Each block has specific requirements
- **Use the correct table structure** - Blocks won't render if the structure is wrong
- **Don't nest blocks** - Unless specifically documented
- **Keep block content concise** - Blocks work best with focused content

### When NOT to Use Blocks

Use default content (paragraphs, headings, lists) for:
- Simple text content
- Single images with captions
- Basic lists
- Inline links

## Images

### Quality

- **Use high-resolution source images** - At least 750px wide for most blocks
- **Maintain consistent aspect ratios** - Especially in grids (Cards, Carousel)
- **Optimize before upload** - Keep files under 5MB

### Alt Text

- **Always add alt text** - Required for accessibility
- **Be descriptive but concise** - Under 125 characters
- **Skip "image of..." prefixes** - Just describe the content

### File Naming

- Use lowercase letters and hyphens
- Be descriptive: `coca-cola-holiday-2025.jpg` not `IMG_1234.jpg`
- Avoid spaces and special characters

## Writing for the Web

### Headlines

- **Front-load important words** - Put key information first
- **Use sentence case** - "How to download assets" not "How To Download Assets"
- **Keep headlines short** - Under 70 characters for main headings

### Body Text

- **Write short paragraphs** - 2-4 sentences max
- **Use bullet points** - For lists of 3+ items
- **Break up long content** - Use subheadings every 2-3 paragraphs
- **Write in active voice** - "Click the button" not "The button should be clicked"

### Links

- **Use descriptive link text** - "View the FAQ" not "Click here"
- **Check all links work** - Before publishing
- **Open external links in new tabs** - When appropriate

## Buttons

### Primary vs Secondary

| Use Primary For | Use Secondary For |
|-----------------|-------------------|
| Main action (Sign In) | Alternative action (Register) |
| One per section | Supporting actions |
| Most important CTA | Less prominent options |

### Button Text

- **Use action verbs** - "Download", "Sign In", "Submit"
- **Keep text short** - 1-3 words is ideal
- **Be specific** - "Download PDF" better than "Download"

## Localization

- **Mirror folder structure** - Same hierarchy across languages
- **Use same page names** - `/en/help/faq` and `/ja/help/faq`
- **Keep block names in English** - `cards` not `カード`
- **Translate all visible text** - Including alt text and metadata

## Common Mistakes to Avoid

### Structure Mistakes

| Mistake | Solution |
|---------|----------|
| Missing block name row | First row must contain only the block name |
| Wrong number of columns | Check block documentation for requirements |
| Nested blocks | Avoid unless specifically supported |
| Missing section breaks | Use `---` to separate sections |

### Content Mistakes

| Mistake | Solution |
|---------|----------|
| Walls of text | Break into paragraphs with headings |
| Missing alt text | Add descriptions to all meaningful images |
| Vague link text | Use descriptive text like "View FAQ" |
| Inconsistent styling | Follow established patterns |

### Publishing Mistakes

| Mistake | Solution |
|---------|----------|
| Publishing without preview | Always preview first |
| Forgetting to publish images | Images must be published separately |
| Broken internal links | Check links point to published pages |
| Missing metadata | Add title and description to every page |

## Quality Checklist

Before publishing, verify:

- [ ] Page previews correctly
- [ ] All images display properly
- [ ] All links work
- [ ] Metadata (title, description) is set
- [ ] Content is proofread
- [ ] Mobile view looks good
- [ ] Blocks render as expected
- [ ] Alt text is added to images

## Getting Help

- **Document Authoring Docs** - [docs.da.live](https://docs.da.live/)
- **AEM Edge Delivery Services** - [aem.live/docs](https://www.aem.live/docs/)
- **This Guide** - [Blocks Overview](blocks/README.md), [Page Structure](page-structure.md)

## Related

- [Getting Started](getting-started.md) - Authoring basics
- [Page Structure](page-structure.md) - Sections and metadata
- [Blocks Overview](blocks/README.md) - Available blocks
- [Images and Media](images-and-media.md) - Image guidelines
- [Localization](localization.md) - Multi-language content
