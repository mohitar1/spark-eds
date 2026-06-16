/* eslint-disable import/no-cycle */
/**
 * Download/Cart Panels Initialization Module
 *
 * This module initializes the shared cart state and global functions.
 * The actual panel components are loaded from blocks/koassets-search/components/cart/
 * This provides full-featured cart/download panels on any page, even without koassets-search.
 */

import { initCartState } from './cart-state.js';

// Initialize cart state and global functions
initCartState();
