# Test Coverage

This project uses vitest with v8 coverage provider to generate code coverage reports.

## Running Coverage

### Unit Tests (with vitest)

Run unit tests with coverage:
```bash
bun run test:coverage:unit
```

View coverage in watch mode:
```bash
bun run test:coverage:watch
```

### Integration Tests (with bun)

Run integration tests with coverage:
```bash
bun run test:coverage:integration
```

Note: Integration tests use Bun-specific APIs and require the Bun runtime.

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- **coverage/index.html** - Interactive HTML coverage report
- **coverage/lcov.info** - LCOV format for CI/CD integration
- **coverage/coverage-final.json** - JSON format for programmatic access

To view the HTML report:
```bash
open coverage/index.html
# or
python -m http.server --directory coverage 8000
# Then visit http://localhost:8000
```

## Configuration

Coverage is configured in `vitest.config.ts`:

- **Provider**: v8 (fastest and most accurate)
- **Reporters**: text, json, html, lcov
- **Thresholds**:
  - Lines: 30%
  - Functions: 20%
  - Branches: 30%
  - Statements: 30%

Thresholds can be adjusted in the configuration as coverage improves.

## CI/CD Integration

The `lcov.info` file can be used with various CI/CD services:

- **GitHub Actions**: Use codecov or coveralls
- **GitLab CI**: Built-in coverage visualization
- **Jenkins**: Use with relevant plugins

Example GitHub Actions snippet:
```yaml
- name: Run tests with coverage
  run: bun run test:coverage:unit

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Notes

- Integration tests are excluded from vitest coverage (they use Bun APIs)
- Unit tests run with vitest in node environment
- All source files in `src/` are included in coverage calculation
- Test files and configuration files are excluded from coverage
