import Sqids from 'sqids';

const ASSET_URN_PREFIX = 'urn:aaid:aem:';

// Cache Sqids instances by alphabet — created once per Worker isolate lifecycle.
const sqidsCache = new Map();
function getSqids(alphabet) {
  if (!sqidsCache.has(alphabet)) sqidsCache.set(alphabet, new Sqids({ alphabet }));
  return sqidsCache.get(alphabet);
}

function uuidToNumbers(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) return null;
  return [0, 1, 2, 3].map((i) => parseInt(hex.slice(i * 8, i * 8 + 8), 16));
}

function numbersToUuid(nums) {
  const hex = nums.map((n) => n.toString(16).padStart(8, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/**
 * Encode a bare UUID or full `urn:aaid:aem:UUID` to a Sqids token.
 * Returns the original value unchanged if it is not a valid UUID.
 */
export function encodeId(id, alphabet) {
  let uuid = id;
  if (id.startsWith(ASSET_URN_PREFIX)) uuid = id.slice(ASSET_URN_PREFIX.length);
  const nums = uuidToNumbers(uuid);
  if (!nums) return id;
  return getSqids(alphabet).encode(nums);
}

/**
 * Decode a Sqids token to a bare UUID.
 * Returns null if the token does not decode to exactly 4 uint32 numbers.
 */
export function decodeToUuid(token, alphabet) {
  const nums = getSqids(alphabet).decode(token);
  if (nums.length !== 4) return null;
  if (nums.some((n) => n > 0xffffffff)) return null;
  return numbersToUuid(nums);
}

/**
 * Decode a Sqids token to a full `urn:aaid:aem:UUID` asset URN.
 * Returns null if the token is not a valid encoded UUID.
 */
export function decodeToAssetUrn(token, alphabet) {
  const uuid = decodeToUuid(token, alphabet);
  return uuid ? `${ASSET_URN_PREFIX}${uuid}` : null;
}
