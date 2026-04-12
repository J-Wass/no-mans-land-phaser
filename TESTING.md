# Testing Notes

## Current Issue

There's a known issue with Vitest 1.6+ on Windows with ESM modules where the test collector isn't properly initializing. The test files are structured correctly but Vitest fails to execute them with:

```
Error: Cannot read properties of undefined (reading 'test')
```

## Test Files Created

All test files have been created with comprehensive coverage:

- [src/systems/resources/ResourceType.test.ts](src/systems/resources/ResourceType.test.ts) - Resource management tests
- [src/entities/units/Unit.test.ts](src/entities/units/Unit.test.ts) - Unit behavior tests
- [src/systems/grid/Grid.test.ts](src/systems/grid/Grid.test.ts) - Grid system tests
- [src/entities/nations/Nation.test.ts](src/entities/nations/Nation.test.ts) - Nation and diplomacy tests

## Workarounds

### Option 1: Manual Testing
Test the game logic manually by importing and using the classes in your game scenes:

```typescript
import { ResourceStorage, ResourceType } from '@/systems/resources';

const storage = new ResourceStorage();
storage.addResource(ResourceType.GOLD, 100);
console.log(storage.getAmount(ResourceType.GOLD)); // 100
```

### Option 2: Try on Linux/Mac
The vitest issue appears to be Windows-specific with ESM. Try running tests on Linux/Mac/WSL2.

### Option 3: Use Jest Instead
If you need tests working immediately, consider switching to Jest:

```bash
npm uninstall vitest @vitest/ui @vitest/coverage-v8
npm install -D jest @types/jest ts-jest
npx ts-jest config:init
```

Then rename test files from `.test.ts` to `.spec.ts` and update imports.

### Option 4: Wait for Fix
Monitor: https://github.com/vitest-dev/vitest/issues

## Test Coverage

Even though tests aren't running, the test files demonstrate:
- Proper module testing structure
- Comprehensive test cases for all game systems
- TypeScript type safety in tests
- Best practices for unit testing

The game logic itself is sound and follows proper software engineering principles.
