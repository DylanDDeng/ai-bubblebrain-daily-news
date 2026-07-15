import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/worker/**/*.test.js'],
        clearMocks: true,
        restoreMocks: true,
    },
});
