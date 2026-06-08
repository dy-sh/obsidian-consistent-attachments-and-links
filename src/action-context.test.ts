import {
  describe,
  expect,
  it
} from 'vitest';

import { ActionContext } from './action-context.ts';

describe('ActionContext', () => {
  it('should have the expected enum values', () => {
    expect(ActionContext.CollectAttachments).toBe('CollectAttachments');
    expect(ActionContext.MoveAttachmentToProperFolder).toBe('MoveAttachmentToProperFolder');
  });
});
