import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { foldAll, foldEvent, initialState, type RunState } from '../../state/fold';
import { parseJsonl } from '../../data/sources';
import type { SourceInfo } from '../../data/useRunStream';
import type { RunEvent } from '../../types';
import { RunView, layoutFor } from '../RunView';
import { fmtNumber } from '../claims/ClaimsPanel';

const FIXTURES = fileURLToPath(new URL('../../../public/fixtures/', import.meta.url));
const load = (name: string): RunEvent[] => parseJsonl(readFileSync(`${FIXTURES}${name}.jsonl`, 'utf8'));
const claims = load('demo_claims');
const apiReplay: SourceInfo = { kind: 'api-replay', name: 'claims_deseq2', speed: 1, status: { state: 'open' } };
const render = (s: RunState) => renderToStaticMarkup(<RunView state={s} source={apiReplay} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('Paper & claims layout', () => {
  it('is used for lab "claims" and for no other fixture', () => {
    const s = foldAll(claims);
    expect(layoutFor(s)).toBe('claims');
    const html = render(s);
    expect(html).toContain('data-layout="claims"');
    expect(html).not.toContain('data-layout="default"');
    for (const name of ['demo_categorical', 'demo_numeric', 'demo_error']) {
      const other = render(foldAll(load(name)));
      expect(other, name).toContain('data-layout="default"');
      expect(other, name).not.toContain('data-layout="claims"');
    }
    expect(layoutFor(foldAll(load('demo_oneletter')))).toBe('oneletter');
  });

  it('renders after every event of the fixture', () => {
    let s = initialState();
    expect(() => render(s)).not.toThrow();
    for (const ev of claims) {
      s = foldEvent(s, ev);
      expect(() => render(s), `after seq ${ev.seq} (${ev.type})`).not.toThrow();
    }
  });

  it('shows the paper, the highlighted quotes and the open claims once claims.source arrives', () => {
    const at = claims.findIndex((e) => e.type === 'claims.source');
    const html = render(foldAll(claims.slice(0, at + 1)));
    expect(html).toContain('Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2');
    expect(html).toContain('Love, Huber &amp; Anders (2014) Genome Biology 15:550');
    expect(html).toContain('href="https://doi.org/10.1186/s13059-014-0550-8"');
    expect(html).toContain('data-testid="licence"');
    expect(html).toContain('CC BY 4.0');
    expect(html).toContain('data-testid="fixture-badge"');
    expect(count(html, '<mark ')).toBe(4);
    expect(count(html, 'data-testid="claim-card"')).toBe(4);
    expect(count(html, 'data-verdict="open"')).toBeGreaterThanOrEqual(8);
    expect(html).toContain('Waiting for the engine to open this claim');
    expect(count(html, 'data-testid="planted-badge"')).toBe(1);
  });

  it('shows verdicts, deciding evidence and ruled-out options at the end, next to the ranking, console and ledger', () => {
    const html = render(foldAll(claims));
    // Verdict chips carry text, not only colour.
    for (const label of ['Holds', 'Holds if', 'Refuted']) expect(html).toContain(`</span>${label}</span>`);
    expect(count(html, 'data-testid="claim-card" data-claim')).toBe(4);
    expect(html).toContain('data-claim="claim-bh_fwer" data-verdict="refuted"');
    expect(html).toContain('data-claim="claim-wald_calibration" data-verdict="holds_if"');
    expect(count(html, 'Decided by')).toBe(4);
    expect(html).toContain('fwer = 1');
    expect(html).toContain('type1_error = 0.0505');
    expect(html).toContain('FWER above 0.20');
    expect(html).toContain('referee ✓ valid');
    expect(html).toContain('Condition');
    expect(html).toContain('Calibrated only when dispersions are shrunk');
    expect(count(html, 'data-testid="ruled-out"')).toBe(4);
    expect(html).toContain('line-through');
    expect(html).toContain('4 of 4 decided');
    expect(html).toContain('Experiment ranking');
    expect(html).toContain('Sandbox console');
    expect(html).toContain('Rejected ledger');
    // The referee's invalid verdict on the replicate-count bug stays in the console.
    expect(html).toContain('Referee · invalid');
  });

  it('shows the claim under test while its diagnostic runs', () => {
    const at = claims.findIndex((e) => e.type === 'experiment.started');
    const html = render(foldAll(claims.slice(0, at + 1)));
    expect(html).toContain('Testing');
    expect(html).toContain('testing <span class="font-mono font-bold">Q2</span>');
    expect(html).toContain('Simulate 2,000 null genes, 3 vs 3 replicates, gene-wise dispersions');
  });

  it('keeps the referee ruling on an invalid diagnostic on the claim until a valid one replaces it', () => {
    const invalid = claims.findIndex((e) => e.type === 'referee.verdict' && !(e.payload as { valid: boolean }).valid);
    const html = render(foldAll(claims.slice(0, invalid + 1)));
    expect(count(html, 'data-testid="claim-invalid"')).toBe(1);
    expect(html).toContain('simulates two replicates per group');
    const next = claims.findIndex((e, i) => i > invalid && e.type === 'belief.updated');
    expect(render(foldAll(claims.slice(0, next + 1)))).not.toContain('data-testid="claim-invalid"');
  });

  it('waits for the paper when the claims run has not sent claims.source yet', () => {
    const s = foldEvent(initialState(), {
      run_id: 'r',
      seq: 0,
      ts: 1,
      type: 'run.started',
      payload: { lab: 'claims', goal: 'g', config: {} },
    });
    const html = render(s);
    expect(html).toContain('data-layout="claims"');
    expect(html).toContain('Waiting for the paper and its claims.');
    expect(html).not.toContain('data-testid="fixture-badge"');
  });
});

describe('number formatting', () => {
  it('keeps key numbers short', () => {
    expect(fmtNumber(1)).toBe('1');
    expect(fmtNumber(0.0505)).toBe('0.0505');
    expect(fmtNumber(0.083456)).toBe('0.0835');
    expect(fmtNumber(-0.0038)).toBe('-0.0038');
    expect(fmtNumber(0.00001)).toBe('1.0e-5');
    expect(fmtNumber(547.93)).toBe('547.9');
  });
});
