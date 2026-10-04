using ClosedXML.Excel;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Export;

/// <summary>
/// The finance export: sheet "Журнал" (every entry of the period) and sheet "Итоги". Dates are shown in the shop's time zone.
/// Text that came from people (comments, author names) is always written as a string cell; a string that starts like a formula
/// (<c>= + - @</c>, tab, CR) also gets the quote prefix, so a spreadsheet never evaluates it.
/// </summary>
public class FinanceExcelWriter : IFinanceReportWriter
{
    private static readonly string[] JournalHeaders = ["Дата", "Вид", "Заказ №", "Категория", "Сумма, ₸", "Комментарий", "Автор"];

    private readonly StoreClock _clock;

    public FinanceExcelWriter(StoreClock clock)
    {
        _clock = clock;
    }

    public byte[] Write(FinanceExportDto export)
    {
        using var workbook = new XLWorkbook();
        WriteJournal(workbook.Worksheets.Add("Журнал"), export);
        WriteSummary(workbook.Worksheets.Add("Итоги"), export.Summary);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string KindName(FinanceEntryKind kind) => kind switch
    {
        FinanceEntryKind.Income => "Приход",
        FinanceEntryKind.Reversal => "Сторно",
        _ => "Расход"
    };

    private static string? CategoryName(ExpenseCategory? category) => category switch
    {
        ExpenseCategory.Purchase => "Закупка",
        ExpenseCategory.Delivery => "Доставка",
        ExpenseCategory.Other => "Прочее",
        _ => null
    };

    private static void SetText(IXLCell cell, string? text)
    {
        if (string.IsNullOrEmpty(text)) return;
        cell.SetValue(text); // a string value is a text cell, never parsed as a formula
        if (text[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            cell.Style.IncludeQuotePrefix = true;
        }
    }

    private void WriteJournal(IXLWorksheet sheet, FinanceExportDto export)
    {
        for (var c = 0; c < JournalHeaders.Length; c++)
        {
            sheet.Cell(1, c + 1).Value = JournalHeaders[c];
        }

        sheet.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var e in export.Entries)
        {
            var local = _clock.ToLocal(e.Date);
            // An expense is entered for a calendar day, a payment happens at a moment.
            var date = sheet.Cell(row, 1);
            date.SetValue(e.Kind == FinanceEntryKind.Expense ? local.Date : local);
            date.Style.DateFormat.Format = e.Kind == FinanceEntryKind.Expense ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm";
            sheet.Cell(row, 2).SetValue(KindName(e.Kind));
            if (e.OrderId is { } orderId) sheet.Cell(row, 3).SetValue(orderId);
            SetText(sheet.Cell(row, 4), CategoryName(e.Category));
            // Signed, so that the column adds up to the balance: an income adds, a reversal and an expense subtract.
            var amount = sheet.Cell(row, 5);
            amount.SetValue(e.Kind == FinanceEntryKind.Income ? e.Amount : -e.Amount);
            amount.Style.NumberFormat.Format = "#,##0";
            SetText(sheet.Cell(row, 6), e.Comment);
            SetText(sheet.Cell(row, 7), e.Author);
            row++;
        }

        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(row, 200));
        sheet.Column(6).Width = Math.Min(sheet.Column(6).Width, 60);
    }

    private static void WriteSummary(IXLWorksheet sheet, FinanceSummaryDto s)
    {
        sheet.Cell(1, 1).Value = "Период";
        sheet.Cell(1, 2).Value = $"{s.DateFrom} — {s.DateTo}";
        sheet.Cell(2, 1).Value = "Часовой пояс магазина";
        sheet.Cell(2, 2).Value = s.StoreTimeZone;

        var lines = new (string Label, decimal Value)[]
        {
            ("Приход", s.Income),
            ("Сторно", -s.Reversals),
            ("Расходы", -s.Expenses),
            ("Баланс", s.Balance)
        };
        for (var i = 0; i < lines.Length; i++)
        {
            sheet.Cell(4 + i, 1).Value = lines[i].Label;
            var value = sheet.Cell(4 + i, 2);
            value.SetValue(lines[i].Value);
            value.Style.NumberFormat.Format = "#,##0";
        }

        sheet.Cell(8, 1).Value = "Платежей прихода";
        sheet.Cell(8, 2).SetValue(s.IncomeCount);
        sheet.Cell(9, 1).Value = "Расходов";
        sheet.Cell(9, 2).SetValue(s.ExpenseCount);

        sheet.Column(1).Style.Font.Bold = true;
        sheet.Row(7).Style.Font.Bold = true;
        sheet.Columns().AdjustToContents();
    }
}
