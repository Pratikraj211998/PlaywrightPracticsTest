// A typed, validated environment loader. Tests import `loadEnv`, never `process.env`.
export interface TestEnv {
  name: string;
  baseURL: string;
  userEmail: string;
  password: string;
  isCI: boolean;
}

const presets: Record<string, Pick<TestEnv, 'baseURL' | 'userEmail'>> = {
  local: { baseURL: 'http://localhost:3000', userEmail: 'asha@example.com' },
  staging: { baseURL: 'https://staging.example.com', userEmail: 'qa.user@example.com' },
};

export function loadEnv(source: Record<string, string | undefined> = process.env): TestEnv {
  const name = source.TEST_ENV ?? 'local';
  const preset = presets[name];
  if (!preset) throw new Error(`Unknown TEST_ENV "${name}". Use one of: ${Object.keys(presets).join(', ')}`);
  const password = source.PASSWORD ?? (name === 'local' ? 'secret' : undefined);
  if (!password) throw new Error(`PASSWORD is required for TEST_ENV=${name}`);   // secrets come from the environment
  return { name, ...preset, baseURL: source.BASE_URL ?? preset.baseURL, password, isCI: !!source.CI };
}
