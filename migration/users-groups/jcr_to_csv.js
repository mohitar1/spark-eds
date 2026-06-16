#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

// STANDARD_LABEL_CHAR_MAPPING from JcrUtil.java (256 entries, indexed by char code)
// Source: com.day.cq.commons.jcr.JcrUtil (cq-commons)
const STANDARD_LABEL_CHAR_MAPPING = [
  // 0x00-0x0F (control chars)
  '_','_','_','_','_','_','_','_','_','_','_','_','_','_','_','_',
  // 0x10-0x1F (control chars)
  '_','_','_','_','_','_','_','_','_','_','_','_','_','_','_','_',
  // 0x20-0x2F: sp ! " # $ % & ' ( ) * + , - . /
  '_','_','_','_','_','_','_','_','_','_','_','_','_','-','_','_',
  // 0x30-0x3F: 0-9 : ; < = > ?
  '0','1','2','3','4','5','6','7','8','9','_','_','_','_','_','_',
  // 0x40-0x4F: @ A-O
  '_','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o',
  // 0x50-0x5F: P-Z [ \ ] ^ _
  'p','q','r','s','t','u','v','w','x','y','z','_','_','_','_','_',
  // 0x60-0x6F: ` a-o
  '_','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o',
  // 0x70-0x7F: p-z { | } ~ DEL
  'p','q','r','s','t','u','v','w','x','y','z','_','_','_','_','_',
  // 0x80-0x8F
  '_','f','_','_','_','fi','fi','_','_','_','_','_','_','_','_','_',
  // 0x90-0x9F
  '_','_','_','_','_','_','_','_','_','_','_','_','y','_','_','_',
  // 0xA0-0xAF
  '_','i','c','p','o','v','_','s','_','_','_','_','_','_','_','_',
  // 0xB0-0xBF
  '_','_','_','_','_','_','_','_','_','_','_','_','_','_','_','_',
  // 0xC0-0xCF: À Á Â Ã Ä Å Æ Ç È É Ê Ë Ì Í Î Ï
  'a','a','a','a','ae','a','ae','c','e','e','e','e','i','i','i','i',
  // 0xD0-0xDF: Ð Ñ Ò Ó Ô Õ Ö × Ø Ù Ú Û Ü Ý Þ ß
  'd','n','o','o','o','o','oe','x','o','u','u','u','ue','y','b','ss',
  // 0xE0-0xEF: à á â ã ä å æ ç è é ê ë ì í î ï
  'a','a','a','a','ae','a','ae','c','e','e','e','e','i','i','i','i',
  // 0xF0-0xFF: ð ñ ò ó ô õ ö ÷ ø ù ú û ü ý þ ÿ
  'o','n','o','o','o','o','oe','_','o','u','u','u','ue','y','b','y',
];

const DEFAULT_REPL = '_';

/**
 * Replicate JcrUtil.createValidName() using STANDARD_LABEL_CHAR_MAPPING.
 * - Characters 0-255 are mapped via the table
 * - Characters > 255 map to '_'
 * - Consecutive replacement chars ('_') are collapsed into one
 * - After position 16, replacement chars are dropped entirely
 * - Max output length is 64 items
 */
function jcrCreateValidName(name) {
  const result = [];
  let prevEscaped = false;

  for (const ch of name) {
    const code = ch.codePointAt(0);
    const repl = code < STANDARD_LABEL_CHAR_MAPPING.length
      ? STANDARD_LABEL_CHAR_MAPPING[code]
      : DEFAULT_REPL;

    if (repl === DEFAULT_REPL) {
      if (!prevEscaped && result.length < 16) {
        result.push(DEFAULT_REPL);
      }
      prevEscaped = true;
    } else {
      result.push(repl);
      prevEscaped = false;
    }

    if (result.length >= 64) break;
  }

  return result.slice(0, 64).join('');
}

/**
 * Replicate SavedSearchUtils.createUserFolderPath() logic.
 * Path: /content/dam/tccc-saved-search/{first_char}/{first_3_chars}/{username}
 */
function savedSearchPath(email) {
  if (!email || !email.includes('@')) return '';
  const localPart = email.split('@')[0];
  const folderName = jcrCreateValidName(localPart);
  const limit = Math.min(3, folderName.length);
  return `/content/dam/tccc-saved-search/${folderName[0]}/${folderName.slice(0, limit)}/${folderName}`;
}

/**
 * Replicate UserSyncServiceImpl.createAssetSourcingFolderAndSetProperties().
 * Path: /content/dam/tccc-user/{3-char-prefix}/{local_part}/templates
 */
function templatePath(email) {
  if (!email || !email.includes('@')) return '';
  const localPart = email.split('@')[0];
  const normLocal = jcrCreateValidName(localPart);
  const normFolder = normLocal.length > 3 ? normLocal.slice(0, 3) : normLocal;
  return `/content/dam/tccc-user/${normFolder}/${normLocal}/templates`;
}

async function parseXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  return parseStringPromise(xml, { attrkey: '$', explicitArray: false });
}

function safeName(name) {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

function csvEscape(field) {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields) {
  return fields.map(csvEscape).join(',');
}

function findContentXmlFiles(dir) {
  const entries = fs.readdirSync(dir, { recursive: true });
  return entries
    .filter((entry) => path.basename(entry) === '.content.xml')
    .map((entry) => path.join(dir, entry));
}

// ---------------------------------------------------------------------------
// User export
// ---------------------------------------------------------------------------

async function parseUserXml(xmlPath) {
  try {
    const result = await parseXml(xmlPath);
    const root = result['jcr:root'];
    if (!root || !root.$) return null;

    const attrs = root.$;
    if (attrs['jcr:primaryType'] !== 'rep:User') return null;

    const principalName = attrs['rep:principalName'] || '';
    if (!principalName) return null;
    const email = principalName.toLowerCase();
    const externalId = attrs['rep:externalId'] || '';

    // Profile fields
    const profile = root.profile && root.profile.$ ? root.profile.$ : {};
    const givenName = profile.givenName || '';
    const surName = profile.surName || '';
    const country = profile.country || '';
    const userType = profile.userType || '';
    const title = profile.title || '';
    const userId = profile.userId || '';
    const termsDate = profile.termsDate || '';

    const nameParts = [];
    if (givenName) nameParts.push(givenName);
    if (surName) nameParts.push(surName);
    const name = nameParts.join(' ');

    // Determine IDP
    let idp = 'local';
    if (xmlPath.includes('/tccc/idp/')) {
      idp = 'ms';
    } else if (externalId && externalId.includes(';')) {
      idp = externalId.split(';').pop();
    }

    return {
      email,
      name,
      country,
      employeeType: userType,
      title,
      koid: userId,
      termsDate,
      idp,
      savedSearchPath: savedSearchPath(email),
      templatePath: templatePath(email),
    };
  } catch (err) {
    console.error(`Error parsing ${xmlPath}: ${err.message}`);
    return null;
  }
}

async function exportUsers(jcrRoot, outputDir) {
  const basePath = path.join(jcrRoot, 'home', 'users');
  const systemPrefix = path.join(basePath, 'system') + path.sep;

  if (!fs.existsSync(basePath)) {
    console.log('No users directory found');
    return;
  }

  const xmlFiles = findContentXmlFiles(basePath);
  const users = [];

  for (const xmlFile of xmlFiles) {
    // Skip system users
    if (xmlFile.startsWith(systemPrefix)
      || xmlFile === path.join(basePath, 'system', '.content.xml')) continue;

    const userData = await parseUserXml(xmlFile);
    if (userData) {
      users.push(userData);
      if (users.length % 100 === 0) {
        console.log(`Processed ${users.length} users...`);
      }
    }
  }

  console.log(`\nTotal users found: ${users.length}`);

  fs.mkdirSync(outputDir, { recursive: true });
  const csvPath = path.join(outputDir, 'users.csv');

  const fieldnames = [
    'email', 'name', 'country', 'employeeType', 'title',
    'koid', 'termsDate', 'idp', 'savedSearchPath', 'templatePath',
  ];
  const lines = [csvRow(fieldnames)];
  for (const user of users) {
    lines.push(csvRow(fieldnames.map((f) => user[f])));
  }

  fs.writeFileSync(csvPath, `${lines.join('\r\n')}\r\n`, 'utf8');
  console.log(`CSV file created: ${csvPath}`);
  console.log(`Total records written: ${users.length}`);
}

// ---------------------------------------------------------------------------
// Group export
// ---------------------------------------------------------------------------

function parseWeakReference(weakRefString) {
  if (!weakRefString || weakRefString === '{WeakReference}[]') return [];
  const content = weakRefString
    .replace('{WeakReference}[', '')
    .replace(']', '');
  if (!content) return [];
  return content.split(',').map((s) => s.trim()).filter(Boolean);
}

async function extractPrincipalInfo(xmlPath) {
  try {
    const result = await parseXml(xmlPath);
    const root = result['jcr:root'];
    if (!root || !root.$) return { uuid: '', principalName: '', entityType: 'unknown' };

    const attrs = root.$;
    const uuid = attrs['jcr:uuid'] || '';
    const principalName = attrs['rep:principalName'] || '';
    const primaryType = attrs['jcr:primaryType'] || '';
    const externalId = attrs['rep:externalId'] || '';

    let entityType = 'unknown';
    if (primaryType === 'rep:Group') entityType = 'group';
    else if (primaryType === 'rep:User') entityType = 'user';

    return { uuid, principalName, entityType, externalId };
  } catch (err) {
    console.error(`Error parsing ${xmlPath}: ${err.message}`);
    return { uuid: '', principalName: '', entityType: 'unknown' };
  }
}

async function extractGroupMembers(xmlPath) {
  try {
    const result = await parseXml(xmlPath);
    const root = result['jcr:root'];
    if (!root || !root.$) return [];

    const allMembers = [];

    // Main rep:members attribute
    const mainMembers = root.$['rep:members'] || '';
    if (mainMembers) {
      allMembers.push(...parseWeakReference(mainMembers));
    }

    // rep:membersList sub-elements
    const membersList = root['rep:membersList'];
    if (membersList) {
      for (const [key, value] of Object.entries(membersList)) {
        if (key === '$') continue;
        const membersAttr = value && value.$ ? value.$['rep:members'] || '' : '';
        if (membersAttr) {
          allMembers.push(...parseWeakReference(membersAttr));
        }
      }
    }

    return allMembers;
  } catch (err) {
    console.error(`Error parsing ${xmlPath}: ${err.message}`);
    return [];
  }
}

async function buildUuidMapping(jcrRoot) {
  console.log('Building UUID to principal name mapping...');

  const uuidToName = {};
  const uuidToType = {};
  const uuidToPath = {};

  const processDir = async (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    const xmlFiles = findContentXmlFiles(dirPath);
    for (const xmlFile of xmlFiles) {
      const { uuid, principalName, entityType } = await extractPrincipalInfo(xmlFile);
      if (uuid && principalName) {
        uuidToName[uuid] = principalName;
        uuidToType[uuid] = entityType;
        const folderPath = path.relative(jcrRoot, path.dirname(xmlFile));
        uuidToPath[uuid] = `/${folderPath}`;
      }
    }
  };

  await processDir(path.join(jcrRoot, 'home', 'groups'));
  await processDir(path.join(jcrRoot, 'home', 'users'));

  console.log(`Built mapping for ${Object.keys(uuidToName).length} entities`);
  return { uuidToName, uuidToType, uuidToPath };
}

async function exportGroups(jcrRoot, outputDir) {
  const groupsPath = path.join(jcrRoot, 'home', 'groups');
  if (!fs.existsSync(groupsPath)) {
    console.log('No groups directory found');
    return;
  }

  const { uuidToName, uuidToType, uuidToPath } = await buildUuidMapping(jcrRoot);

  console.log('Exporting groups...');
  const macPrefix = path.join(groupsPath, 'mac') + path.sep;
  const projectsPrefix = path.join(groupsPath, 'projects') + path.sep;

  // CUG group prefix → subfolder routing
  const cugBaseDir = path.join(outputDir, 'groups', 'cug');
  const CUG_PREFIX_MAP = [
    { prefix: 'ASC_CUG_bottler_', subfolder: 'bottlers' },
    { prefix: 'ASC_CUG_restrictedbrand_', subfolder: 'restrictedbrands' },
    { prefix: 'ASC_CUG_customer_', subfolder: 'customers' },
    { prefix: 'ASC_CUG_agency_', subfolder: 'agency' },
  ];
  const resolveCugDir = (name) => {
    const match = CUG_PREFIX_MAP.find((m) => name.startsWith(m.prefix));
    return match ? path.join(cugBaseDir, match.subfolder) : cugBaseDir;
  };

  const otherOutputDir = path.join(outputDir, 'groups', 'other');
  fs.mkdirSync(cugBaseDir, { recursive: true });
  for (const { subfolder } of CUG_PREFIX_MAP) {
    fs.mkdirSync(path.join(cugBaseDir, subfolder), { recursive: true });
  }
  fs.mkdirSync(otherOutputDir, { recursive: true });

  const xmlFiles = findContentXmlFiles(groupsPath);
  let cugCount = 0;
  let otherCount = 0;
  let skippedIms = 0;
  let skippedMac = 0;
  let skippedProjects = 0;

  for (const xmlFile of xmlFiles) {
    const { principalName, entityType, externalId } = await extractPrincipalInfo(xmlFile);
    if (!principalName || entityType !== 'group') continue;
    if (externalId.endsWith(';ims')) { skippedIms += 1; continue; }
    if (xmlFile.startsWith(macPrefix)) { skippedMac += 1; continue; }
    if (xmlFile.startsWith(projectsPrefix)) { skippedProjects += 1; continue; }

    const memberUuids = await extractGroupMembers(xmlFile);
    const resolvedMembers = memberUuids.map((uuid) => ({
      name: uuidToName[uuid] || uuid,
      type: uuidToType[uuid] || 'unknown',
      memberPath: uuidToPath[uuid] || '',
    }));

    // Sort: groups first, then users, alphabetical within each
    const groups = resolvedMembers
      .filter((m) => m.type === 'group')
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const users = resolvedMembers
      .filter((m) => m.type === 'user')
      .map((m) => ({ ...m, name: m.name.toLowerCase() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const others = resolvedMembers
      .filter((m) => m.type !== 'group' && m.type !== 'user')
      .sort((a, b) => a.name.localeCompare(b.name));

    const sortedMembers = [...groups, ...users, ...others];

    const missingCount = sortedMembers
      .filter((m) => m.name.includes('-') && m.name.length === 36)
      .length;

    const isCug = principalName.startsWith('ASC_CUG_');
    const destDir = isCug ? resolveCugDir(principalName) : otherOutputDir;
    if (isCug) cugCount += 1;
    else otherCount += 1;

    const csvPath = path.join(destDir, `${safeName(principalName)}.csv`);
    const lines = [csvRow(['name', 'path'])];
    for (const member of sortedMembers) {
      lines.push(csvRow([member.name, member.memberPath]));
    }

    fs.writeFileSync(csvPath, `${lines.join('\r\n')}\r\n`, 'utf8');

    if (missingCount > 0) {
      console.log(
        `Exported ${sortedMembers.length} members to ${csvPath}`
        + ` (${missingCount} missing references)`,
      );
    } else {
      console.log(`Exported ${sortedMembers.length} members to ${csvPath}`);
    }
  }

  console.log(`Exported ${cugCount} cug groups to ${cugBaseDir}`);
  console.log(`Exported ${otherCount} other groups to ${otherOutputDir}`);
  console.log(`Skipped ${skippedIms} IMS, ${skippedMac} mac, ${skippedProjects} projects groups`);
}

// ---------------------------------------------------------------------------
// Domain Mappings
// ---------------------------------------------------------------------------

function exportDomainMappings(jcrRoot, outputDir) {
  const commonsPath = path.join(
    jcrRoot, 'content', 'dam', 'tccc-commons',
  );
  if (!fs.existsSync(commonsPath)) {
    console.log('No tccc-commons directory found');
    return;
  }

  const domainsDir = path.join(outputDir, 'domains');
  fs.mkdirSync(domainsDir, { recursive: true });

  const entries = fs.readdirSync(commonsPath, { withFileTypes: true });
  const mappingDirs = entries
    .filter((e) => e.isDirectory() && e.name.endsWith('-Domain-Mappings.json'))
    .map((e) => e.name);

  if (mappingDirs.length === 0) {
    console.log('No domain mapping files found');
    return;
  }

  console.log('Exporting domain mappings...');

  for (const dirName of mappingDirs) {
    const jsonPath = path.join(
      commonsPath, dirName, '_jcr_content', 'renditions', 'original',
    );
    if (!fs.existsSync(jsonPath)) {
      console.log(`Skipped ${dirName} (no original rendition)`);
      continue;
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    // Deduplicate case variants — keep lowercase domain only
    const seen = new Map();
    for (const [domain, group] of Object.entries(raw)) {
      const lower = domain.toLowerCase();
      if (!seen.has(lower)) seen.set(lower, group);
    }

    // Sort by domain
    const sorted = [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b));

    const lines = [csvRow(['domain', 'group'])];
    for (const [domain, group] of sorted) {
      lines.push(csvRow([domain, group]));
    }

    const csvName = dirName
      .replace(/\.json$/, '')
      .toLowerCase();
    const csvPath = path.join(domainsDir, `${csvName}.csv`);
    fs.writeFileSync(csvPath, `${lines.join('\r\n')}\r\n`, 'utf8');
    console.log(`Exported ${sorted.length} domains to ${csvPath}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  let jcrRoot = 'tccc-groups/jcr_root';
  let outputDir = 'csv';

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-o' || args[i] === '--output') {
      i += 1;
      outputDir = args[i];
    } else {
      jcrRoot = args[i];
    }
  }

  if (!fs.existsSync(jcrRoot)) {
    console.error(`Error: JCR root path '${jcrRoot}' does not exist`);
    process.exit(1);
  }

  jcrRoot = path.resolve(jcrRoot);
  outputDir = path.resolve(outputDir);

  await exportUsers(jcrRoot, outputDir);
  console.log('');
  await exportGroups(jcrRoot, outputDir);
  console.log('');
  exportDomainMappings(jcrRoot, outputDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
