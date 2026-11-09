export type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Level[] = ['debug', 'info', 'warn', 'error'];

// The output function is injectable, so the logger itself can be unit tested.
export class Logger {
  constructor(
    private readonly scope: string,
    private readonly threshold: Level = 'info',
    private readonly out: (line: string) => void = console.log,
  ) {}

  private write(level: Level, message: string) {
    if (order.indexOf(level) < order.indexOf(this.threshold)) return;
    this.out(`[${level.toUpperCase()}] [${this.scope}] ${message}`);
  }
  debug(m: string) { this.write('debug', m); }
  info(m: string) { this.write('info', m); }
  warn(m: string) { this.write('warn', m); }
  error(m: string) { this.write('error', m); }
}
