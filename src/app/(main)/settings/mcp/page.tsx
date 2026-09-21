import type { Metadata } from 'next';
import { McpSettings } from '@/components/settings/mcp-settings';

export const metadata: Metadata = { title: 'AI agents (MCP)' };

export default function McpPage() {
  return <McpSettings />;
}
