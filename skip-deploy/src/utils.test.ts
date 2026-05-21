import { describe, it, expect } from 'bun:test';
import {
    type UpdateEntry,
    createCommitMessage,
} from './utils.ts';
import {AppDeployDescriptorSerde} from "../../utils/common-types.ts";

describe('createCommitMessage', () => {
    it ('should return all apps, and count unique environments', () => {
        const [summary] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace1:app2:1.0.0'),
            updateEntry('cluster1:namespace1:app3:1.0.0'),
        ]);
        expect(summary).toBe('Updated app1, app2, and app3 across 1 environment(s)')
    });

    it ('should return all apps, and count unique environments', () => {
        const [summary] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace2:app2:1.0.0'),
        ]);
        expect(summary).toBe('Updated app1 and app2 across 2 environment(s)')
    });

    it ('should description of each app deployed', () => {
        const [_,description] = createCommitMessage([
            updateEntry('cluster1:namespace1:app1:1.0.0'),
            updateEntry('cluster1:namespace2:app1:1.1.1'),
            updateEntry('cluster1:namespace2:app2:1.0.0'),
        ]);
        expect(description).toBe([
            'Updated app1',
            'cluster1:namespace1: old_version -> 1.0.0',
            'cluster1:namespace2: old_version -> 1.1.1',
            '',
            'Updated app2',
            'cluster1:namespace2: old_version -> 1.0.0',
            '',
        ].join('\n'));
    });


    const updateEntry = (val: string): UpdateEntry => {
        const app = AppDeployDescriptorSerde.deserialize(val);
        return { ...app, originalVersion: 'old_version' }
    }
});