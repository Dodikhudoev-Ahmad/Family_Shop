import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminLayout } from '../../components/AdminLayout/AdminLayout';
import { useToast } from '../../context/ToastContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { amountError, MAX_COMMENT, rangeError } from '../../utils/financeRules';
import { formatPrice } from '../../utils/formatPrice';
import { formatMonthLabel, formatStoreDate, formatStoreDateTime, setStoreTimeZone, storeTodayIso } from '../../utils/storeTime';
import {
  ApiError,
  createExpense,
  downloadFinanceExport,
  fetchFinanceChart,
  fetchFinanceJournal,
  fetchFinanceSummary,
  type ExpenseCategory,
  type FinanceChartDto,
  type FinanceEntryDto,
  type FinanceEntryKind,
  type FinancePeriod,
  type FinanceSummaryDto,
} from '../../lib/api';
import './AdminFinancePage.css';

const PAGE_SIZE = 10;

const PERIODS: { value: FinancePeriod; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'custom', label: 'Период' },
];

const KIND_TABS: { value: FinanceEntryKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'Income', label: 'Приход' },
  { value: 'Reversal', label: 'Сторно' },
  { value: 'Expense', label: 'Расходы' },
];

const KIND_LABEL: Record<FinanceEntryKind, string> = { Income: 'Приход', Reversal: 'Сторно', Expense: 'Расход' };
const CATEGORY_LABEL: Record<ExpenseCategory, string> = { Purchase: 'Закупка', Delivery: 'Доставка', Other: 'Прочее' };

const signed = (entry: FinanceEntryDto) => (entry.kind === 'Income' ? '+' : '−') + formatPrice(entry.amount);

export function AdminFinancePage() {
  const { showToast } = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState<FinanceSummaryDto | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [chart, setChart] = useState<FinanceChartDto | null>(null);
  const [chartError, setChartError] = useState(false);

  const [kind, setKind] = useState<FinanceEntryKind | 'all'>('all');
  const [journalFrom, setJournalFrom] = useState('');
  const [journalTo, setJournalTo] = useState('');
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<FinanceEntryDto[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [journalLoading, setJournalLoading] = useState(true);
  const [journalError, setJournalError] = useState<string | null>(null);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const summaryRequest = useRef(0);
  const journalRequest = useRef(0);

  const customRangeError = period === 'custom' ? rangeError(customFrom, customTo) : null;
  const customIncomplete = period === 'custom' && (!customFrom || !customTo);
  const journalRangeError = rangeError(journalFrom, journalTo);

  useEffect(() => {
    if (customIncomplete || customRangeError) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    const id = ++summaryRequest.current;
    setSummaryError(null);
    fetchFinanceSummary(period, customFrom, customTo)
      .then((data) => {
        if (summaryRequest.current !== id) return;
        setStoreTimeZone(data.storeTimeZone);
        setSummary(data);
      })
      .catch((err: unknown) => {
        if (summaryRequest.current !== id) return;
        setSummary(null);
        setSummaryError(err instanceof ApiError ? err.message : 'Не удалось загрузить итоги.');
      });
  }, [period, customFrom, customTo, customIncomplete, customRangeError, reloadTick]);

  useEffect(() => {
    fetchFinanceChart()
      .then((data) => {
        setStoreTimeZone(data.storeTimeZone);
        setChart(data);
        setChartError(false);
      })
      .catch(() => setChartError(true));
  }, [reloadTick]);

  useEffect(() => {
    setPage(1);
  }, [kind, journalFrom, journalTo]);

  useEffect(() => {
    if (journalRangeError) return;
    const id = ++journalRequest.current;
    setJournalLoading(true);
    setJournalError(null);
    fetchFinanceJournal({
      kind: kind === 'all' ? undefined : kind,
      dateFrom: journalFrom || undefined,
      dateTo: journalTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (journalRequest.current !== id) return;
        setEntries(result.items);
        setTotalCount(result.totalCount);
      })
      .catch((err: unknown) => {
        if (journalRequest.current !== id) return;
        setJournalError(err instanceof ApiError ? err.message : 'Не удалось загрузить журнал.');
      })
      .finally(() => {
        if (journalRequest.current === id) setJournalLoading(false);
      });
  }, [kind, journalFrom, journalTo, journalRangeError, page, reloadTick]);

  const handleExport = async () => {
    if (!summary || isExporting) return;
    setIsExporting(true);
    try {
      const { blob, fileName } = await downloadFinanceExport(summary.dateFrom, summary.dateTo);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Не удалось скачать файл.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExpenseSaved = () => {
    setExpenseOpen(false);
    showToast('Расход добавлен');
    setPage(1);
    setReloadTick((n) => n + 1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasJournalFilters = kind !== 'all' || journalFrom !== '' || journalTo !== '';

  return (
    <AdminLayout>
      <div className="fin">
        <header className="fin__header">
          <div>
            <h1>Финансы</h1>
            <p>Приход по доставленным заказам, расходы и баланс магазина</p>
          </div>
          <div className="fin__header-actions">
            <button className="fin__btn" onClick={handleExport} disabled={!summary || isExporting}>
              {isExporting ? 'Готовим файл…' : 'Скачать Excel'}
            </button>
            <button className="fin__btn fin__btn--primary" onClick={() => setExpenseOpen(true)}>
              + Расход
            </button>
          </div>
        </header>

        <div className="fin__tabs" role="tablist" aria-label="Период итогов">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              role="tab"
              aria-selected={period === p.value}
              className={`fin__tab ${period === p.value ? 'is-active' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="fin__range">
            <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Период: от" />
            <span aria-hidden="true">—</span>
            <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} aria-label="Период: до" />
          </div>
        )}
        {customRangeError && <p className="admin-page-error">{customRangeError}</p>}
        {customIncomplete && !customRangeError && <p className="fin__hint">Выберите обе даты периода.</p>}

        {summaryError ? <p className="admin-page-error">{summaryError}</p> : <SummaryCards summary={summary} waiting={customIncomplete || !!customRangeError} />}

        <section className="fin__section" aria-labelledby="fin-chart-title">
          <h2 id="fin-chart-title">Последние 12 месяцев</h2>
          {chartError ? <p className="admin-page-error">Не удалось загрузить график.</p> : <MonthlyChart chart={chart} />}
        </section>

        <section className="fin__section" aria-labelledby="fin-journal-title">
          <h2 id="fin-journal-title">Журнал</h2>
          <div className="fin__journal-filters">
            <div className="fin__tabs" role="tablist" aria-label="Вид записей">
              {KIND_TABS.map((tab) => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={kind === tab.value}
                  className={`fin__tab ${kind === tab.value ? 'is-active' : ''}`}
                  onClick={() => setKind(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="fin__range">
              <input type="date" value={journalFrom} onChange={(e) => setJournalFrom(e.target.value)} aria-label="Журнал: от" />
              <span aria-hidden="true">—</span>
              <input type="date" value={journalTo} onChange={(e) => setJournalTo(e.target.value)} aria-label="Журнал: до" />
            </div>
          </div>
          {journalRangeError && <p className="admin-page-error">{journalRangeError}</p>}

          {journalError && <p className="admin-page-error">{journalError}</p>}
          {!journalError && journalLoading && <JournalSkeleton />}
          {!journalError && !journalLoading && entries !== null && entries.length === 0 && (
            <div className="admin-empty">
              <h3>{hasJournalFilters ? 'По этим фильтрам записей нет' : 'Записей пока нет'}</h3>
              <p>
                {hasJournalFilters
                  ? 'Измените вид записей или период.'
                  : 'Приход появится, когда заказ станет «Доставлен». Расходы вносятся кнопкой «+ Расход».'}
              </p>
            </div>
          )}
          {!journalError && !journalLoading && entries !== null && entries.length > 0 && (
            <>
              {isMobile ? <JournalCards entries={entries} /> : <JournalTable entries={entries} />}
              <div className="admin-pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Назад
                </button>
                <span>
                  Страница {page} из {totalPages} · {totalCount} запис(ей)
                </span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Далее
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={handleExpenseSaved} />
    </AdminLayout>
  );
}

function SummaryCards({ summary, waiting }: { summary: FinanceSummaryDto | null; waiting: boolean }) {
  const balanceTone = summary ? (summary.balance < 0 ? 'is-negative' : summary.balance > 0 ? 'is-positive' : '') : '';
  const cards = [
    { key: 'income', label: 'Приход', value: summary && formatPrice(summary.income), note: summary && `${summary.incomeCount} заказ(ов)`, tone: '' },
    { key: 'reversals', label: 'Сторно', value: summary && formatPrice(summary.reversals), note: 'возвраты прихода', tone: '' },
    { key: 'expenses', label: 'Расходы', value: summary && formatPrice(summary.expenses), note: summary && `${summary.expenseCount} запис(ей)`, tone: '' },
    { key: 'balance', label: 'Баланс', value: summary && formatPrice(summary.balance), note: 'приход − сторно − расходы', tone: balanceTone },
  ];

  return (
    <>
      {summary && (
        <p className="fin__period" data-testid="fin-period">
          {summary.dateFrom === summary.dateTo ? formatDay(summary.dateFrom) : `${formatDay(summary.dateFrom)} — ${formatDay(summary.dateTo)}`}
        </p>
      )}
      <div className="fin-stats">
        {cards.map((card, i) => (
          <div className="fin-stats__card" style={{ animationDelay: `${i * 70}ms` }} key={card.key} data-testid={`fin-card-${card.key}`}>
            <span className="fin-stats__label">{card.label}</span>
            {card.value ? (
              <span className={`fin-stats__value ${card.tone}`}>{card.value}</span>
            ) : waiting ? (
              <span className="fin-stats__value">—</span>
            ) : (
              <span className="skeleton fin-stats__skeleton" />
            )}
            <span className="fin-stats__note">{card.note ?? ''}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** yyyy-MM-dd (a calendar day of the shop) as a readable date; no time zone shifts a bare date. */
function formatDay(day: string): string {
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function MonthlyChart({ chart }: { chart: FinanceChartDto | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // On a narrow screen the chart scrolls sideways; start at the current month, which is the one that matters.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [chart]);

  if (!chart) return <span className="skeleton fin-chart__skeleton" />;

  const outflow = (m: FinanceChartDto['months'][number]) => m.reversals + m.expenses;
  const max = Math.max(0, ...chart.months.flatMap((m) => [m.income, outflow(m)]));
  if (max === 0) {
    return (
      <div className="admin-empty">
        <h3>Движения денег пока нет</h3>
        <p>График заполнится, когда появятся доставленные заказы или расходы.</p>
      </div>
    );
  }

  return (
    <>
      <div className="fin-chart__legend">
        <span className="fin-chart__key fin-chart__key--income">Приход</span>
        <span className="fin-chart__key fin-chart__key--outflow">Расходы и сторно</span>
      </div>
      <div className="fin-chart__scroll" ref={scrollRef}>
        <ul className="fin-chart" aria-label="Приход и расходы по месяцам">
          {chart.months.map((m) => {
            const label = `${formatMonthLabel(m.month)}: приход ${formatPrice(m.income)}, расходы и сторно ${formatPrice(outflow(m))}, баланс ${formatPrice(m.balance)}`;
            return (
              <li key={m.month} className="fin-chart__col" title={label} aria-label={label} tabIndex={0}>
                <div className="fin-chart__bars">
                  <span className="fin-chart__bar fin-chart__bar--income" style={{ height: `${(m.income / max) * 100}%` }} />
                  <span className="fin-chart__bar fin-chart__bar--outflow" style={{ height: `${(outflow(m) / max) * 100}%` }} />
                </div>
                <span className="fin-chart__label">{formatMonthLabel(m.month)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function entryWhen(entry: FinanceEntryDto): string {
  // An expense is entered for a calendar day; a payment happened at a moment.
  return entry.kind === 'Expense' ? formatStoreDate(entry.date) : formatStoreDateTime(entry.date);
}

function EntryDetails({ entry }: { entry: FinanceEntryDto }) {
  if (entry.kind === 'Expense') {
    return (
      <>
        <div className="fin-entry__title">{entry.category ? CATEGORY_LABEL[entry.category] : 'Расход'}</div>
        {entry.comment && <div className="fin-entry__sub">{entry.comment}</div>}
        {entry.author && <div className="fin-entry__sub">{entry.author}</div>}
      </>
    );
  }
  return <div className="fin-entry__title">Заказ FS-{entry.orderId}</div>;
}

function KindBadge({ kind }: { kind: FinanceEntryKind }) {
  return <span className={`fin-badge fin-badge--${kind.toLowerCase()}`}>{KIND_LABEL[kind]}</span>;
}

function JournalTable({ entries }: { entries: FinanceEntryDto[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table fin-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Вид</th>
            <th>Описание</th>
            <th className="fin-table__amount">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.kind}-${entry.id}`}>
              <td>{entryWhen(entry)}</td>
              <td>
                <KindBadge kind={entry.kind} />
              </td>
              <td>
                <EntryDetails entry={entry} />
              </td>
              <td className={`fin-table__amount fin-amount fin-amount--${entry.kind.toLowerCase()}`}>{signed(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JournalCards({ entries }: { entries: FinanceEntryDto[] }) {
  return (
    <div className="admin-cards">
      {entries.map((entry) => (
        <div className="fin-entry" key={`${entry.kind}-${entry.id}`}>
          <div className="fin-entry__top">
            <KindBadge kind={entry.kind} />
            <span className={`fin-amount fin-amount--${entry.kind.toLowerCase()}`}>{signed(entry)}</span>
          </div>
          <EntryDetails entry={entry} />
          <div className="fin-entry__when">{entryWhen(entry)}</div>
        </div>
      ))}
    </div>
  );
}

function JournalSkeleton() {
  return (
    <div className="admin-cards">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="fin-entry">
          <span className="skeleton" style={{ height: 16, width: '50%', marginBottom: 10 }} />
          <span className="skeleton" style={{ height: 14, width: '75%' }} />
        </div>
      ))}
    </div>
  );
}

function ExpenseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('Purchase');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    setCategory('Purchase');
    setAmount('');
    setDate(storeTodayIso());
    setComment('');
    setErrors([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isSaving, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const found: string[] = [];
    const amountProblem = amountError(amount);
    if (amountProblem) found.push(amountProblem);
    if (!date) found.push('Укажите дату.');
    else if (date > storeTodayIso()) found.push('Дата расхода не может быть в будущем.');
    if (comment.length > MAX_COMMENT) found.push(`Комментарий — не больше ${MAX_COMMENT} символов.`);
    setErrors(found);
    if (found.length > 0) return;

    setIsSaving(true);
    try {
      await createExpense({ category, amount: Number(amount.replace(/\s/g, '')), date, comment: comment.trim() || undefined });
      onSaved();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Не удалось сохранить расход.']);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-modal__backdrop" onClick={() => !isSaving && onClose()}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="fin-expense-title" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__header">
          <h2 id="fin-expense-title">Новый расход</h2>
          <button className="admin-drawer__close" onClick={onClose} aria-label="Закрыть" disabled={isSaving}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal__form" noValidate>
          <label className="admin-form-field">
            <span>Категория</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form-field">
            <span>Сумма, ₸</span>
            <input type="text" inputMode="numeric" autoComplete="off" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" />
          </label>

          <label className="admin-form-field">
            <span>Дата</span>
            <input type="date" value={date} max={storeTodayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="admin-form-field">
            <span>
              Комментарий <small className="fin__counter">{comment.length}/{MAX_COMMENT}</small>
            </span>
            <textarea value={comment} maxLength={MAX_COMMENT} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
          </label>

          {errors.length > 0 && (
            <div className="admin-form-errors" role="alert">
              {errors.map((err) => (
                <p key={err}>{err}</p>
              ))}
            </div>
          )}

          <div className="admin-modal__actions">
            <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={isSaving}>
              Отмена
            </button>
            <button type="submit" className="confirm-dialog__confirm" disabled={isSaving}>
              {isSaving ? <span className="confirm-dialog__spinner" /> : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
