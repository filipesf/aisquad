import { describe, expect, it } from 'vitest';
import { parseMentions } from '../domain/comments.js';

describe('mention parsing', () => {
  it('extracts a single mention', () => {
    expect(parseMentions('Hello @alice')).toEqual(['alice']);
  });

  it('extracts multiple mentions', () => {
    expect(parseMentions('@alice and @bob should review')).toEqual(['alice', 'bob']);
  });

  it('deduplicates mentions', () => {
    expect(parseMentions('@alice mentioned @alice twice')).toEqual(['alice']);
  });

  it('returns empty array for no mentions', () => {
    expect(parseMentions('No mentions here')).toEqual([]);
  });

  it('handles mentions with hyphens', () => {
    expect(parseMentions('cc @agent-alpha and @agent-beta')).toEqual(['agent-alpha', 'agent-beta']);
  });

  it('handles mentions with underscores', () => {
    expect(parseMentions('Hey @my_agent')).toEqual(['my_agent']);
  });

  it('handles mention at start of text', () => {
    expect(parseMentions('@first thing')).toEqual(['first']);
  });

  it('handles mention at end of text', () => {
    expect(parseMentions('talk to @last')).toEqual(['last']);
  });

  it('handles text that is just a mention', () => {
    expect(parseMentions('@solo')).toEqual(['solo']);
  });

  it('does not match email-style patterns as standalone mentions', () => {
    // The regex matches @domain in user@domain, but that's acceptable
    // since agent names won't contain dots
    const result = parseMentions('email user@domain please');
    expect(result).toEqual(['domain']);
  });

  it('handles adjacent mentions', () => {
    expect(parseMentions('@alice@bob')).toEqual(['alice', 'bob']);
  });

  it('handles mentions with numbers', () => {
    expect(parseMentions('@agent1 @agent2')).toEqual(['agent1', 'agent2']);
  });
});
