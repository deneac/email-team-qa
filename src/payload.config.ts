import { mcpPlugin } from '@payloadcms/plugin-mcp'
import path from 'path'
import { buildFigmaConfig } from '@payloadcms/figma'
import { fileURLToPath } from 'url'
import { Activity } from './collections/Activity'
import { Approvals } from './collections/Approvals'
import { Campaigns } from './collections/Campaigns'
import { Comments } from './collections/Comments'
import { Folders } from './collections/Folders'
import { Media } from './collections/Media'
import { Revisions } from './collections/Revisions'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildFigmaConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  csrf: ['http://localhost:3000', 'https://email-team-qa.pung.site'],
  collections: [Users, Campaigns, Revisions, Comments, Approvals, Activity, Media, Folders, Tags],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: ['en'],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [mcpPlugin({})],
  figma: {},
})
