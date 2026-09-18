/*
 * ghostwire sourcemaps upload --dir .next/static --url-prefix /_next/static [--release x] [--delete]
 * ghostwire releases new <version> [--environment production] [--commit sha] [--url link]
 *
 * Reads GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID and GHOSTWIRE_ERROR_KEY (or --host, --website, --key).
 */
import { detectRelease, registerRelease, uploadSourceMaps } from './releases';

const HELP = `Usage:
  ghostwire sourcemaps upload --dir <folder> [--url-prefix <path>] [--release <version>] [--delete]
  ghostwire releases new <version> [--environment <name>] [--commit <sha>] [--url <link>]

Options for both: --host, --website, --key (or GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID,
GHOSTWIRE_ERROR_KEY). The release defaults to GHOSTWIRE_RELEASE or the CI commit SHA.`;

function parse(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const [name, inline] = arg.slice(2).split('=', 2);
    const next = argv[i + 1];
    if (inline !== undefined) flags[name] = inline;
    else if (next && !next.startsWith('--')) flags[name] = argv[++i];
    else flags[name] = true;
  }

  return { positional, flags };
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parse(argv);
  const text = (name: string) =>
    typeof flags[name] === 'string' ? (flags[name] as string) : undefined;
  const server = { host: text('host'), websiteId: text('website'), key: text('key') };
  const [group, command, value] = positional;

  if (group === 'sourcemaps' && command === 'upload') {
    const dir = text('dir');
    const release = text('release') ?? detectRelease();
    if (!dir || !release)
      throw new Error('--dir and a release (--release or GHOSTWIRE_RELEASE) are required.');

    const result = await uploadSourceMaps({
      ...server,
      dir,
      release,
      urlPrefix: text('url-prefix'),
      deleteAfter: flags.delete === true,
      onProgress: (done, total) => console.log(`Uploaded ${done}/${total} source maps`),
    });

    console.log(`Release ${release}: ${result.saved} of ${result.found} source maps saved.`);
    for (const failure of result.failed) console.warn(`  ${failure.file}: ${failure.error}`);
    return result.failed.length ? 1 : 0;
  }

  if (group === 'releases' && command === 'new') {
    const version = value ?? detectRelease();
    if (!version) throw new Error('Give the version: ghostwire releases new <version>');

    await registerRelease({
      ...server,
      version,
      environment: text('environment'),
      commit: text('commit') ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA,
      url: text('url'),
    });

    console.log(`Registered release ${version}.`);
    return 0;
  }

  console.log(HELP);
  return group ? 1 : 0;
}
