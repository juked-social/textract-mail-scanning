/** @type {import('eslint').Linter.FlatConfig} */

const parser = require('@typescript-eslint/parser');
const ESLintPlugin = require('@typescript-eslint/eslint-plugin');

// Define the recommended configurations directly
const eslintRecommended = {
    rules: {
        'consistent-return': 'warn',
        'dot-notation': 'warn',
        'init-declarations': 'warn',
        'max-params': ['warn', { 'max': 4 }],
        'no-dupe-class-members': 'error',
        'no-empty-function': ['warn', { 'allow': ['functions'] }],
        'no-invalid-this': 'warn',
        'no-loop-func': 'warn',
        'no-loss-of-precision': 'warn',
        'no-restricted-imports': 'warn',
        'no-unused-expressions': 'warn',
        'no-useless-constructor': 'warn',
        'prefer-destructuring': 'warn',
        // Add other recommended rules here if needed
    }
};

const typescriptRecommended = {
    rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { 'args': 'none' }],
        '@typescript-eslint/no-inferrable-types': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-var-requires': 'warn',
        '@typescript-eslint/ban-ts-comment': 'warn',
        // Add other TypeScript recommended rules here if needed
    }
};

module.exports = [
    {
        files: ['**/*.{tsx,ts}'],
        languageOptions: {
            parser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
                ecmaVersion: 2020,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': ESLintPlugin,
        },
        rules: {
            ...eslintRecommended.rules,
            ...typescriptRecommended.rules,
            'max-len': [1, { 'code': 150 }],
            'semi': ['error', 'always'],
            'curly': 'error',
            'quotes': ['error', 'single'],
            'no-console': ['warn'],
            'no-useless-escape': ['off'],
            'indent': ['error', 4, { 'SwitchCase': 1 }],
            'no-unexpected-multiline': ['error'],
            'no-tabs': ['error', { 'allowIndentationTabs': true }],
            'object-curly-spacing': ['error', 'always'],
            'space-infix-ops': ['error'],
            'space-unary-ops': ['error'],
            'spaced-comment': ['error'],
            'switch-colon-spacing': ['error', { 'after': true, 'before': false }],
            'no-var': ['error'],
            'no-multiple-empty-lines': ['error', { 'max': 2, 'maxBOF': 1 }],
            'no-multi-spaces': ['error'],
            'no-fallthrough': ['error'],
            'brace-style': ['error', '1tbs'],
            'no-return-await': ['error'],
            'prefer-const': 'warn',
            'no-prototype-builtins': 'warn',
            'key-spacing': ['error', { 'afterColon': true }],
        },
        ignores: ['node_modules/', 'dist/', 'cdk.out/', '**/*.d.ts', '**/*.js'], // Ignore these directories
    }
];
