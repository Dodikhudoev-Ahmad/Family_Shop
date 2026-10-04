using ClosedXML.Excel;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;
using Infrastructure.Export;

namespace Application.Tests.Services;

public class FinanceExportTests
{
    private static readonly StoreClock Clock = StoreClock.FromId("Asia/Almaty", () => new DateTime(2030, 5, 15, 7, 0, 0, DateTimeKind.Utc));

    private static DateTime Utc(int y, int m, int d, int h, int min = 0) => new(y, m, d, h, min, 0, DateTimeKind.Utc);

    private static FinanceExportDto Export(params FinanceEntryDto[] entries) => new(
        "Asia/Almaty",
        new FinanceSummaryDto(FinancePeriod.Custom, "2030-05-01", "2030-05-15", 12_000, 2_000, 3_000, 7_000, 2, 1, "Asia/Almaty"),
        entries);

    private static XLWorkbook Open(byte[] bytes) => new(new MemoryStream(bytes));

    [Fact]
    public void TheWorkbook_HasAJournalAndASummarySheet_WithSignedNumericAmounts_AndLocalDates()
    {
        var bytes = new FinanceExcelWriter(Clock).Write(Export(
            new FinanceEntryDto(FinanceEntryKind.Income, 1, Utc(2030, 5, 14, 19, 30), 12_000, 77, null, null, null),   // 00:30 on the 15th local
            new FinanceEntryDto(FinanceEntryKind.Reversal, 2, Utc(2030, 5, 15, 1), 2_000, 77, null, null, null),
            new FinanceEntryDto(FinanceEntryKind.Expense, 3, Utc(2030, 5, 13, 19), 3_000, null, ExpenseCategory.Delivery, "Курьер", "Админ")));

        using var book = Open(bytes);
        var journal = book.Worksheet("Журнал");
        Assert.Equal(new[] { "Дата", "Вид", "Заказ №", "Категория", "Сумма, ₸", "Комментарий", "Автор" },
            Enumerable.Range(1, 7).Select(c => journal.Cell(1, c).GetString()).ToArray());

        Assert.Equal(new DateTime(2030, 5, 15, 0, 30, 0), journal.Cell(2, 1).GetDateTime()); // the shop's clock, not UTC's
        Assert.Equal("Приход", journal.Cell(2, 2).GetString());
        Assert.Equal(77, journal.Cell(2, 3).GetDouble());
        Assert.Equal(XLDataType.Number, journal.Cell(2, 5).DataType);
        Assert.Equal(12_000, journal.Cell(2, 5).GetDouble());
        Assert.Equal(-2_000, journal.Cell(3, 5).GetDouble());
        Assert.Equal("Сторно", journal.Cell(3, 2).GetString());

        Assert.Equal(new DateTime(2030, 5, 14), journal.Cell(4, 1).GetDateTime()); // 00:00 on the 14th local, an expense day
        Assert.Equal("Расход", journal.Cell(4, 2).GetString());
        Assert.Equal("Доставка", journal.Cell(4, 4).GetString());
        Assert.Equal(-3_000, journal.Cell(4, 5).GetDouble());
        Assert.Equal("Курьер", journal.Cell(4, 6).GetString());
        Assert.Equal("Админ", journal.Cell(4, 7).GetString());

        var summary = book.Worksheet("Итоги");
        Assert.Equal("2030-05-01 — 2030-05-15", summary.Cell(1, 2).GetString());
        Assert.Equal(12_000, summary.Cell(4, 2).GetDouble());
        Assert.Equal(-2_000, summary.Cell(5, 2).GetDouble());
        Assert.Equal(-3_000, summary.Cell(6, 2).GetDouble());
        Assert.Equal(7_000, summary.Cell(7, 2).GetDouble());
        Assert.Equal("Баланс", summary.Cell(7, 1).GetString());
    }

    [Theory]
    [InlineData("=HYPERLINK(\"http://evil.example\",\"x\")")]
    [InlineData("+1+1")]
    [InlineData("-2+3")]
    [InlineData("@SUM(1,1)")]
    [InlineData("=cmd|' /C calc'!A0")]
    public void TextFromPeople_IsNeverAFormula(string text)
    {
        var bytes = new FinanceExcelWriter(Clock).Write(Export(
            new FinanceEntryDto(FinanceEntryKind.Expense, 1, Utc(2030, 5, 13, 19), 100, null, ExpenseCategory.Other, text, text)));

        using var book = Open(bytes);
        var cell = book.Worksheet("Журнал").Cell(2, 6);
        Assert.False(cell.HasFormula);
        Assert.Equal(XLDataType.Text, cell.DataType);
        Assert.Equal(text, cell.GetString());
        Assert.True(cell.Style.IncludeQuotePrefix); // a spreadsheet shows it as text and does not evaluate it on edit either
        var author = book.Worksheet("Журнал").Cell(2, 7);
        Assert.False(author.HasFormula);
        Assert.Equal(XLDataType.Text, author.DataType);
    }

    [Fact]
    public void ARegularComment_HasNoQuotePrefix()
    {
        var bytes = new FinanceExcelWriter(Clock).Write(Export(
            new FinanceEntryDto(FinanceEntryKind.Expense, 1, Utc(2030, 5, 13, 19), 100, null, ExpenseCategory.Other, "Упаковка", "Админ")));

        using var book = Open(bytes);
        Assert.False(book.Worksheet("Журнал").Cell(2, 6).Style.IncludeQuotePrefix);
    }

    [Fact]
    public void AnEmptyPeriod_StillGivesAWorkbook_WithHeadersOnly()
    {
        using var book = Open(new FinanceExcelWriter(Clock).Write(Export()));

        Assert.Equal("Дата", book.Worksheet("Журнал").Cell(1, 1).GetString());
        Assert.True(book.Worksheet("Журнал").Cell(2, 1).IsEmpty());
    }

    private static (FinanceService Service, IFinanceRepository Finance) ServiceWith(int total)
    {
        var finance = Substitute.For<IFinanceRepository>();
        finance.GetJournalAsync(default, default, default, default, default, default, default)
            .ReturnsForAnyArgs(((IReadOnlyList<FinanceEntry>)[], total));
        finance.GetTotalsAsync(default, default, default).ReturnsForAnyArgs(new FinanceTotals(0, 0, 0, 0, 0, 0));
        var uow = Substitute.For<IUnitOfWork>();
        uow.Finance.Returns(finance);
        return (new FinanceService(uow, Clock), finance);
    }

    [Fact]
    public async Task APeriodOverTheRowCap_IsRefused_WithoutBuildingAWorkbook()
    {
        var (service, _) = ServiceWith(FinanceService.MaxExportRows + 1);

        var result = await service.GetExportAsync(new FinanceRangeDto());

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorCodes.TooManyRows, result.ErrorCode);
    }

    [Fact]
    public async Task ExactlyTheCap_IsAllowed()
    {
        var (service, _) = ServiceWith(FinanceService.MaxExportRows);

        Assert.True((await service.GetExportAsync(new FinanceRangeDto())).IsSuccess);
    }

    [Fact]
    public async Task WithoutDates_TheExportIsTheCurrentMonthOfTheShop_UpToToday()
    {
        var (service, finance) = ServiceWith(0);

        var result = await service.GetExportAsync(new FinanceRangeDto());

        Assert.Equal("2030-05-01", result.Value!.Summary.DateFrom);
        Assert.Equal("2030-05-15", result.Value.Summary.DateTo);
        // 1 May 00:00 local = 30 April 19:00 UTC; the end is the last instant of 15 May local.
        await finance.Received().GetJournalAsync(null, Utc(2030, 4, 30, 19), new DateTime(2030, 5, 15, 18, 59, 59, 999, DateTimeKind.Utc).AddTicks(9999), false, 1, FinanceService.MaxExportRows, Arg.Any<CancellationToken>());
    }
}
