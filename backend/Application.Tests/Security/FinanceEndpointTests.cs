using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;
using Api.Controllers;
using Api.Filters;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Validators;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Tests.Security;

/// <summary>The real finance controller behind real authentication/authorization middleware (the fallback policy of Program.cs
/// and the controller's own [Authorize(Roles = "Admin")]), with the service replaced by a stub: who may call what, and what is
/// refused at the door.</summary>
public class FinanceEndpointTests : IAsyncLifetime
{
    private const string SchemeName = "Test";

    private sealed class HeaderAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public HeaderAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-Role", out var role))
            {
                return Task.FromResult(AuthenticateResult.NoResult()); // no token: anonymous, the middleware answers 401
            }

            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, "42"), new Claim(ClaimTypes.Role, role.ToString())], SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }

    private readonly IFinanceService _finance = Substitute.For<IFinanceService>();
    private readonly IFinanceReportWriter _writer = Substitute.For<IFinanceReportWriter>();
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        var empty = new PagedResult<FinanceEntryDto>([], 0, 1, 20);
        _finance.GetSummaryAsync(default!, default).ReturnsForAnyArgs(new FinanceSummaryDto(FinancePeriod.Month, "2026-10-01", "2026-10-04", 0, 0, 0, 0, 0, 0, "Asia/Almaty"));
        _finance.GetChartAsync(default).ReturnsForAnyArgs(new FinanceChartDto("Asia/Almaty", []));
        _finance.GetJournalAsync(default!, default).ReturnsForAnyArgs(empty);
        _finance.DeleteExpenseAsync(default, default, default).ReturnsForAnyArgs(Result<FinanceEntryDto>.Success(
            new FinanceEntryDto(FinanceEntryKind.Expense, 5, DateTime.UtcNow, 1_500, null, ExpenseCategory.Purchase, null, "Админ", true, DateTime.UtcNow)));
        _finance.AddExpenseAsync(default, default!, default).ReturnsForAnyArgs(Result<FinanceEntryDto>.Success(
            new FinanceEntryDto(FinanceEntryKind.Expense, 1, DateTime.UtcNow, 1_500, null, ExpenseCategory.Purchase, null, "Админ")));

        var summary = new FinanceSummaryDto(FinancePeriod.Custom, "2026-10-01", "2026-10-04", 0, 0, 0, 0, 0, 0, "Asia/Almaty");
        _finance.GetExportAsync(default!, default).ReturnsForAnyArgs(Result<FinanceExportDto>.Success(new FinanceExportDto("Asia/Almaty", summary, [])));
        _writer.Write(default!).ReturnsForAnyArgs([0x50, 0x4B, 0x03, 0x04]);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.Configuration["AllowedHosts"] = "*"; // the test host answers on 127.0.0.1
        builder.Services.AddControllers(o => o.Filters.Add<ValidationFilter>()).AddApplicationPart(typeof(AdminFinanceController).Assembly);
        builder.Services.AddValidatorsFromAssemblyContaining<CreateExpenseRequestValidator>();
        builder.Services.AddSingleton(_finance);
        builder.Services.AddSingleton(_writer);
        builder.Services.AddAuthentication(SchemeName).AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>(SchemeName, _ => { });
        builder.Services.AddAuthorization(o => o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        _app = builder.Build();
        _app.UseAuthentication();
        _app.UseAuthorization();
        _app.MapControllers();
        await _app.StartAsync();
        _client = new HttpClient { BaseAddress = new Uri(_app.Urls.First()) };
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string? role, object? body = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (role is not null) request.Headers.Add("X-Test-Role", role);
        if (body is not null) request.Content = JsonContent.Create(body);
        return _client.SendAsync(request);
    }

    public static IEnumerable<object[]> Endpoints() =>
    [
        [HttpMethod.Get.Method, "/api/v1/admin/finance/summary"],
        [HttpMethod.Get.Method, "/api/v1/admin/finance/chart"],
        [HttpMethod.Get.Method, "/api/v1/admin/finance/journal"],
        [HttpMethod.Get.Method, "/api/v1/admin/finance/export"],
        [HttpMethod.Post.Method, "/api/v1/admin/finance/expenses"],
        [HttpMethod.Delete.Method, "/api/v1/admin/finance/expenses/5"]
    ];

    private static object? ValidBody(string method) =>
        method == "POST" ? new { category = "Purchase", amount = 1500, date = "2026-10-04", comment = "ok" } : null;

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task WithoutAToken_EveryFinanceEndpoint_Is401(string method, string url)
    {
        var response = await SendAsync(new HttpMethod(method), url, null, ValidBody(method));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task ACustomer_IsRefusedEveryFinanceEndpoint_With403(string method, string url)
    {
        var response = await SendAsync(new HttpMethod(method), url, "Customer", ValidBody(method));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task AnAdmin_IsLetIn(string method, string url)
    {
        var response = await SendAsync(new HttpMethod(method), url, "Admin", ValidBody(method));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Deleting_UsesTheAdminFromTheToken_AndReturnsTheDeletedExpense()
    {
        var response = await SendAsync(HttpMethod.Delete, "/api/v1/admin/finance/expenses/5", "Admin");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await _finance.Received(1).DeleteExpenseAsync(42, 5, Arg.Any<CancellationToken>());
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"isDeleted\":true", body);
    }

    [Fact]
    public async Task ACustomersDelete_ReachesNoService()
    {
        var response = await SendAsync(HttpMethod.Delete, "/api/v1/admin/finance/expenses/5", "Customer");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await _finance.DidNotReceiveWithAnyArgs().DeleteExpenseAsync(default, default, default);
    }

    [Fact]
    public async Task DeletingAnUnknownExpense_Is404()
    {
        _finance.DeleteExpenseAsync(default, default, default).ReturnsForAnyArgs(Result<FinanceEntryDto>.Failure("нет", ResultErrorCodes.NotFound));

        var response = await SendAsync(HttpMethod.Delete, "/api/v1/admin/finance/expenses/999", "Admin");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("1.5")]
    public async Task AnExpenseIdThatIsNotAnInteger_IsNeverDeleted(string id)
    {
        var response = await SendAsync(HttpMethod.Delete, $"/api/v1/admin/finance/expenses/{id}", "Admin");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await _finance.DidNotReceiveWithAnyArgs().DeleteExpenseAsync(default, default, default);
    }

    [Fact]
    public async Task TheJournalPassesTheShowDeletedSwitch_OffByDefault()
    {
        await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/journal", "Admin");
        await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/journal?includeDeleted=true", "Admin");

        await _finance.Received(1).GetJournalAsync(Arg.Is<FinanceJournalFilterDto>(f => !f.IncludeDeleted), Arg.Any<CancellationToken>());
        await _finance.Received(1).GetJournalAsync(Arg.Is<FinanceJournalFilterDto>(f => f.IncludeDeleted), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TheExport_IsAnXlsxDownload_NeverCached()
    {
        var response = await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/export?dateFrom=2026-10-01&dateTo=2026-10-04", "Admin");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("finance_2026-10-01_2026-10-04.xlsx", response.Content.Headers.ContentDisposition?.FileName);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal(new byte[] { 0x50, 0x4B, 0x03, 0x04 }, await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task AnExportOverTheRowCap_Is400_WithItsCode()
    {
        _finance.GetExportAsync(default!, default).ReturnsForAnyArgs(Result<FinanceExportDto>.Failure("too many", ResultErrorCodes.TooManyRows));

        var response = await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/export", "Admin");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("too_many_rows", await response.Content.ReadAsStringAsync());
        _writer.DidNotReceiveWithAnyArgs().Write(default!);
    }

    [Theory]
    [InlineData("?dateFrom=2026-10-01")]                              // only one date
    [InlineData("?dateFrom=2026-10-05&dateTo=2026-10-01")]            // reversed
    [InlineData("?dateFrom=2020-01-01&dateTo=2026-01-01")]            // over 366 days
    public async Task AnExportWithABadRange_Is400(string query)
    {
        var response = await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/export" + query, "Admin");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await _finance.DidNotReceiveWithAnyArgs().GetExportAsync(default!, default);
    }

    [Fact]
    public async Task ARefusedCustomer_ReachesNeitherTheServiceNorTheDatabase()
    {
        await SendAsync(HttpMethod.Post, "/api/v1/admin/finance/expenses", "Customer", ValidBody("POST"));
        await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/summary", null);

        await _finance.DidNotReceiveWithAnyArgs().AddExpenseAsync(default, default!, default);
        await _finance.DidNotReceiveWithAnyArgs().GetSummaryAsync(default!, default);
    }

    [Fact]
    public async Task TheExpensesAuthor_IsTheAdminFromTheToken_NotAnythingTheBodyClaims()
    {
        var response = await SendAsync(HttpMethod.Post, "/api/v1/admin/finance/expenses", "Admin",
            new { category = "Delivery", amount = 900, date = "2026-10-04", createdByUserId = 7, author = "Someone Else" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await _finance.Received(1).AddExpenseAsync(
            42, Arg.Is<CreateExpenseRequestDto>(r => r.Category == ExpenseCategory.Delivery && r.Amount == 900m && r.Date == new DateTime(2026, 10, 4)), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("/api/v1/admin/finance/summary?period=custom")]                                         // no dates
    [InlineData("/api/v1/admin/finance/summary?period=custom&dateFrom=2026-10-05&dateTo=2026-10-01")]  // reversed
    [InlineData("/api/v1/admin/finance/summary?period=custom&dateFrom=2024-01-01&dateTo=2026-01-01")]  // over 366 days
    [InlineData("/api/v1/admin/finance/summary?period=nonsense")]
    [InlineData("/api/v1/admin/finance/journal?page=0")]
    [InlineData("/api/v1/admin/finance/journal?pageSize=101")]
    [InlineData("/api/v1/admin/finance/journal?pageSize=2000000000")]
    [InlineData("/api/v1/admin/finance/journal?dateFrom=2026-10-05&dateTo=2026-10-01")]
    [InlineData("/api/v1/admin/finance/journal?kind=Nope")]
    public async Task BadQueries_Are400_BeforeTheyReachTheService(string url)
    {
        var response = await SendAsync(HttpMethod.Get, url, "Admin");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await _finance.DidNotReceiveWithAnyArgs().GetSummaryAsync(default!, default);
        await _finance.DidNotReceiveWithAnyArgs().GetJournalAsync(default!, default);
    }

    [Theory]
    [InlineData("{\"category\":\"Purchase\",\"amount\":0,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":\"Purchase\",\"amount\":-5,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":\"Purchase\",\"amount\":10.5,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":\"Purchase\",\"amount\":1000000001,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":\"Mystery\",\"amount\":100,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":99,\"amount\":100,\"date\":\"2026-10-04\"}")]
    [InlineData("{\"category\":\"Purchase\",\"amount\":100,\"date\":\"1900-01-01\"}")]
    [InlineData("{\"category\":\"Purchase\",\"amount\":100}")]
    [InlineData("{}")]
    public async Task BadExpenses_Are400_AndNothingIsAdded(string json)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/finance/expenses")
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-Test-Role", "Admin");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await _finance.DidNotReceiveWithAnyArgs().AddExpenseAsync(default, default!, default);
    }

    [Fact]
    public async Task ACommentOver500Characters_Is400()
    {
        var response = await SendAsync(HttpMethod.Post, "/api/v1/admin/finance/expenses", "Admin",
            new { category = "Other", amount = 100, date = "2026-10-04", comment = new string('x', 501) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task APeriodOfExactly366Days_AndTheBoundaryAmounts_AreAccepted()
    {
        var period = await SendAsync(HttpMethod.Get, "/api/v1/admin/finance/summary?period=custom&dateFrom=2025-01-01&dateTo=2026-01-01", "Admin");
        var max = await SendAsync(HttpMethod.Post, "/api/v1/admin/finance/expenses", "Admin",
            new { category = "Other", amount = 1_000_000_000, date = "2026-10-04" });
        var one = await SendAsync(HttpMethod.Post, "/api/v1/admin/finance/expenses", "Admin",
            new { category = "Other", amount = 1, date = "2026-10-04", comment = new string('x', 500) });

        Assert.Equal(HttpStatusCode.OK, period.StatusCode);
        Assert.Equal(HttpStatusCode.OK, max.StatusCode);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
    }
}
