using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Domain.Interfaces;
using Infrastructure.Security;

namespace Application.Tests.Security;

/// <summary>The optional breached-password check: k-anonymity request, fail-open behaviour, nothing sensitive in logs.</summary>
public class BreachedPasswordTests
{
    // A made-up password for tests; its hash is only used to build the fake service answers.
    private const string Password = "Test-Breach-Pw-42";

    private static string Sha1(string value) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(value)));

    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _respond;
        public List<HttpRequestMessage> Requests { get; } = new();

        public FakeHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) => _respond = respond;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return _respond(request, cancellationToken);
        }
    }

    private static HttpResponseMessage Ok(string body) => new(HttpStatusCode.OK) { Content = new StringContent(body) };

    private sealed class CapturingLogger : ILogger
    {
        public List<string> Messages { get; } = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => Messages.Add(formatter(state, exception) + " " + exception);
    }

    private static HibpBreachedPasswordChecker Checker(FakeHandler handler, ILogger? logger = null, string? url = null) =>
        new(new HttpClient(handler), logger ?? Substitute.For<ILogger>(), url);

    [Fact]
    public async Task OnlyTheFirstFiveCharactersOfTheHash_LeaveTheServer()
    {
        var hash = Sha1(Password);
        var handler = new FakeHandler((_, _) => Task.FromResult(Ok("0000000000000000000000000000000000A:1")));

        await Checker(handler).IsBreachedAsync(Password);

        var request = Assert.Single(handler.Requests);
        Assert.Equal($"https://api.pwnedpasswords.com/range/{hash[..5]}", request.RequestUri!.ToString());
        Assert.DoesNotContain(hash[5..], request.RequestUri.ToString());
        Assert.DoesNotContain(Password, request.RequestUri.ToString());
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Contains("true", request.Headers.GetValues("Add-Padding"));
    }

    [Fact]
    public async Task APasswordWhoseSuffixIsInTheAnswer_IsBreached()
    {
        var suffix = Sha1(Password)[5..];
        var body = $"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3\r\n{suffix.ToLowerInvariant()}:12345\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0\r\n";

        Assert.True(await Checker(new FakeHandler((_, _) => Task.FromResult(Ok(body)))).IsBreachedAsync(Password));
    }

    [Fact]
    public async Task APaddingLineWithCountZero_DoesNotCount()
    {
        var suffix = Sha1(Password)[5..];

        Assert.False(await Checker(new FakeHandler((_, _) => Task.FromResult(Ok($"{suffix}:0\r\n")))).IsBreachedAsync(Password));
    }

    [Fact]
    public async Task APasswordNotInTheAnswer_IsNotBreached()
    {
        var body = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:9\r\n";

        Assert.False(await Checker(new FakeHandler((_, _) => Task.FromResult(Ok(body)))).IsBreachedAsync(Password));
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task AFailureAnswer_IsSkipped_NotBlocking(HttpStatusCode status)
    {
        var handler = new FakeHandler((_, _) => Task.FromResult(new HttpResponseMessage(status)));

        Assert.False(await Checker(handler).IsBreachedAsync(Password));
    }

    [Fact]
    public async Task ANetworkError_IsSkipped_NotBlocking()
    {
        var handler = new FakeHandler((_, _) => throw new HttpRequestException("no route"));

        Assert.False(await Checker(handler).IsBreachedAsync(Password));
    }

    [Fact]
    public async Task ASlowService_IsAbandonedAfterAboutTwoSeconds_NotBlocking()
    {
        var handler = new FakeHandler(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            return Ok("");
        });
        var started = DateTime.UtcNow;

        var breached = await Checker(handler).IsBreachedAsync(Password);

        Assert.False(breached);
        Assert.InRange(DateTime.UtcNow - started, TimeSpan.Zero, TimeSpan.FromSeconds(5));
        Assert.True(HibpBreachedPasswordChecker.Timeout <= TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task TheLogNeverContainsThePasswordOrItsHash()
    {
        var hash = Sha1(Password);
        var log = new CapturingLogger();

        await Checker(new FakeHandler((_, _) => throw new HttpRequestException($"failed for {hash}")), log).IsBreachedAsync(Password);
        await Checker(new FakeHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadGateway))), log).IsBreachedAsync(Password);

        Assert.NotEmpty(log.Messages);
        Assert.All(log.Messages, m =>
        {
            Assert.DoesNotContain(Password, m);
            Assert.DoesNotContain(hash, m, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(hash[..5], m, StringComparison.OrdinalIgnoreCase);
        });
    }

    [Fact]
    public async Task TheDisabledCheck_NeverReportsABreach()
    {
        Assert.False(await new NoBreachedPasswordCheck().IsBreachedAsync(Password));
    }

    // ---- registration ----

    private static (AuthService Sut, IUnitOfWork Uow) Service(IBreachedPasswordChecker? checker)
    {
        var uow = Substitute.For<IUnitOfWork>();
        var users = Substitute.For<IUserRepository>();
        uow.Users.Returns(users);
        users.GetByEmailAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns((Domain.Entities.User?)null);
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        var sut = new AuthService(uow, hasher, Substitute.For<IJwtTokenGenerator>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<AuthService>.Instance, checker);
        return (sut, uow);
    }

    [Fact]
    public async Task Registration_WithABreachedPassword_IsRefused_AndNothingIsSaved()
    {
        var checker = Substitute.For<IBreachedPasswordChecker>();
        checker.IsBreachedAsync(Password, Arg.Any<CancellationToken>()).Returns(true);
        var (sut, uow) = Service(checker);

        var result = await sut.RegisterAsync(new RegisterRequestDto("new@example.com", Password, "New"), SessionContext.Web);

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorCodes.BreachedPassword, result.ErrorCode);
        await uow.Users.DidNotReceive().AddAsync(Arg.Any<Domain.Entities.User>(), Arg.Any<CancellationToken>());
        await uow.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Registration_WhenTheCheckIsOffOrNotConfigured_ProceedsAsBefore()
    {
        var (withoutChecker, uow1) = Service(null);
        var (withNoop, uow2) = Service(new NoBreachedPasswordCheck());

        // The session start needs more collaborators than this test wires; the user being added is what matters.
        await Record.ExceptionAsync(() => withoutChecker.RegisterAsync(new RegisterRequestDto("a@example.com", Password, "A"), SessionContext.Web));
        await Record.ExceptionAsync(() => withNoop.RegisterAsync(new RegisterRequestDto("b@example.com", Password, "B"), SessionContext.Web));

        await uow1.Users.Received(1).AddAsync(Arg.Any<Domain.Entities.User>(), Arg.Any<CancellationToken>());
        await uow2.Users.Received(1).AddAsync(Arg.Any<Domain.Entities.User>(), Arg.Any<CancellationToken>());
    }
}
