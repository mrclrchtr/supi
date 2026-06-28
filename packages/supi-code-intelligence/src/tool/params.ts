/** Shared parameter bag for internal code-intelligence actions. */
export interface CodeQueryParams {
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  pattern?: string;
  regex?: boolean;
  kind?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  contextLines?: number;
  summary?: boolean;
}
