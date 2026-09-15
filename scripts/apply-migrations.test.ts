import { describe, expect, it } from 'vitest'
import { parseBaseline, pendingMigrations } from './apply-migrations.ts'

describe('parseBaseline', () => {
  it('reads one migration filename per line', () => {
    expect(parseBaseline('001_initial_schema.sql\n002_rls_policies.sql\n')).toEqual([
      '001_initial_schema.sql',
      '002_rls_policies.sql',
    ])
  })

  it('ignores blank lines, comments and stray whitespace', () => {
    const text = [
      '# already applied by hand before CI existed',
      '',
      '  001_initial_schema.sql  ',
      '',
      '# end',
    ].join('\n')

    expect(parseBaseline(text)).toEqual(['001_initial_schema.sql'])
  })

  it('reads an empty baseline as nothing applied', () => {
    expect(parseBaseline('')).toEqual([])
  })
})

describe('pendingMigrations', () => {
  it('returns every migration when the database has none', () => {
    expect(pendingMigrations(['002_b.sql', '001_a.sql'], [])).toEqual(['001_a.sql', '002_b.sql'])
  })

  it('returns nothing when every migration is already applied', () => {
    expect(pendingMigrations(['001_a.sql', '002_b.sql'], ['001_a.sql', '002_b.sql'])).toEqual([])
  })

  it('returns only the migrations the database has not seen', () => {
    expect(pendingMigrations(['001_a.sql', '002_b.sql', '003_c.sql'], ['001_a.sql'])).toEqual([
      '002_b.sql',
      '003_c.sql',
    ])
  })

  it('orders pending migrations by filename so they apply in sequence', () => {
    const files = ['011_shopping_rules.sql', '003_seed_data.sql', '011_meal_slot_created_at.sql']

    expect(pendingMigrations(files, [])).toEqual([
      '003_seed_data.sql',
      '011_meal_slot_created_at.sql',
      '011_shopping_rules.sql',
    ])
  })

  it('ignores files in the migrations directory that are not SQL', () => {
    expect(pendingMigrations(['001_a.sql', 'README.md', '.DS_Store'], [])).toEqual(['001_a.sql'])
  })

  it('ignores an applied migration whose file has since been removed', () => {
    expect(pendingMigrations(['002_b.sql'], ['001_deleted.sql'])).toEqual(['002_b.sql'])
  })
})
