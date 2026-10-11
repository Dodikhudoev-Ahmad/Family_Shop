using System.Net;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.Interfaces;
using Application.Mail;
using Domain.Entities;
using Infrastructure.Mail;

namespace Application.Tests.Mail;

public class EmailTemplatesTests
{
    private const string Link = "https://www.familyshop10.kz/reset-password#token=abc_DEF-123";

    [Theory]
    [InlineData("ru", "Сброс пароля")]
    [InlineData("kk", "Құпия сөзді қалпына келтіру")]
    [InlineData("en", "Reset your password")]
    public void ResetLetter_ExistsInAllThreeLanguages(string locale, string subjectPart)
    {
        var message = EmailTemplates.Build(EmailTokenPurpose.Reset, locale, "a@b.kz", "Alice", Link);

        Assert.Contains(subjectPart, message.Subject);
        Assert.Contains(Link, message.TextBody);
        Assert.Contains(subjectPart.Split(' ')[0], message.HtmlBody);
        Assert.Contains($"lang=\"{locale}\"", message.HtmlBody);
    }

    [Theory]
    [InlineData("ru", "Подтвердите email")]
    [InlineData("kk", "Email мекенжайын растаңыз")]
    [InlineData("en", "Confirm your email")]
    public void ConfirmLetter_ExistsInAllThreeLanguages(string locale, string subjectPart)
    {
        var message = EmailTemplates.Build(EmailTokenPurpose.Confirm, locale, "a@b.kz", "Alice", Link);

        Assert.Contains(subjectPart, message.Subject);
        Assert.Contains("24", message.TextBody);
    }

    [Theory]
    [InlineData(null, "ru")]
    [InlineData("", "ru")]
    [InlineData("de", "ru")]
    [InlineData("KK", "kk")]
    [InlineData("en-US", "en")]
    [InlineData("ru_RU", "ru")]
    public void LocaleFallsBackToRussian(string? input, string expected) =>
        Assert.Equal(expected, EmailLocales.Normalize(input));

    [Fact]
    public void TheHtml_HasNoRemoteImagesOrTrackers_AndEscapesTheName()
    {
        var message = EmailTemplates.Build(EmailTokenPurpose.Confirm, "en", "a@b.kz", "<script>alert(1)</script>", Link);

        Assert.DoesNotContain("<img", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<script", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<link", message.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;script&gt;", message.HtmlBody);
    }

    [Fact]
    public void TheMessage_NeverPrintsItsBody()
    {
        var message = EmailTemplates.Build(EmailTokenPurpose.Reset, "en", "a@b.kz", "Alice", Link);

        Assert.DoesNotContain("abc_DEF", message.ToString());
        Assert.DoesNotContain("a@b.kz", message.ToString());
    }
}

public class EmailTransportTests
{
    private static readonly string Key = "re_" + Guid.NewGuid().ToString("N"); // random per run, no key value in the repository

    private sealed class StubHandler : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(Status) { Content = new StringContent("{\"message\":\"to: someone@example.com\"}") };
        }
    }

    private static readonly EmailMessage Message = new("alice@example.com", "Subject", "<p>html</p>", "text");

    private static EmailSettings Settings => new() { ApiKey = Key, From = "noreply@familyshop10.kz" };

    [Fact]
    public async Task Resend_ReceivesTheBearerKey_FromToSubjectHtmlAndText()
    {
        var handler = new StubHandler();
        var transport = new ResendEmailTransport(new HttpClient(handler), Settings);

        await transport.SendAsync(Message, CancellationToken.None);

        Assert.Equal(HttpMethod.Post, handler.Request!.Method);
        Assert.NotNull(handler.Request.Content!.Headers.ContentLength); // buffered body, not chunked: simple servers read it
        Assert.Equal("https://api.resend.com/emails", handler.Request.RequestUri!.ToString());
        Assert.Equal($"Bearer {Key}", handler.Request.Headers.Authorization!.ToString());
        using var json = JsonDocument.Parse(handler.Body!);
        Assert.Equal("noreply@familyshop10.kz", json.RootElement.GetProperty("from").GetString());
        Assert.Equal("alice@example.com", json.RootElement.GetProperty("to")[0].GetString());
        Assert.Equal("Subject", json.RootElement.GetProperty("subject").GetString());
        Assert.Equal("<p>html</p>", json.RootElement.GetProperty("html").GetString());
        Assert.Equal("text", json.RootElement.GetProperty("text").GetString());
    }

    [Fact]
    public async Task AProviderError_ThrowsOnlyTheStatus_NotTheBodyOrTheKey()
    {
        var handler = new StubHandler { Status = HttpStatusCode.UnprocessableEntity };
        var transport = new ResendEmailTransport(new HttpClient(handler), Settings);

        var error = await Assert.ThrowsAsync<EmailDeliveryException>(() => transport.SendAsync(Message, CancellationToken.None));

        Assert.Equal(422, error.StatusCode);
        Assert.DoesNotContain("someone@example.com", error.Message);
        Assert.DoesNotContain(Key, error.ToString());
    }

    [Fact]
    public void TheSettings_NeverPrintTheKey()
    {
        Assert.DoesNotContain(Key, Settings.ToString());
        Assert.Contains("***", Settings.ToString());
    }

    [Fact]
    public void WithoutAKey_SendingIsOff_AndTheDefaultSenderIsTheOwnersAddress()
    {
        var empty = EmailSettings.Read(new ConfigurationBuilder().Build());

        Assert.False(empty.IsConfigured);
        Assert.Equal("noreply@familyshop10.kz", empty.From);
    }

    [Fact]
    public void TheSettings_AreReadFromTheEnvironmentStyleKeys()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Email:ApiKey"] = Key,
            ["Email:From"] = "shop@familyshop10.kz"
        }).Build();

        var settings = EmailSettings.Read(config);

        Assert.True(settings.IsConfigured);
        Assert.Equal("shop@familyshop10.kz", settings.From);
    }

    [Fact]
    public async Task TheDisabledTransport_DoesNothing_AndWarnsWithoutTheAddressOrLink()
    {
        var logger = new ListLogger<DisabledEmailTransport>();
        await new DisabledEmailTransport(logger).SendAsync(Message, CancellationToken.None);

        var line = Assert.Single(logger.Lines);
        Assert.Contains("Email__ApiKey", line);
        Assert.DoesNotContain("alice@example.com", line);
    }

    // ---- queue and dispatcher ----

    private static Channel<EmailMessage> NewQueue() => Channel.CreateBounded<EmailMessage>(10);

    [Fact]
    public async Task TheQueuedSender_ReturnsAtOnce_EvenWhileTheProviderIsHanging()
    {
        var queue = NewQueue();
        var sender = new QueuedEmailSender(queue, NullLogger<QueuedEmailSender>.Instance);

        var task = sender.SendAsync(Message);

        Assert.True(task.IsCompleted);
        Assert.True(queue.Reader.TryRead(out var queued));
        Assert.Equal("alice@example.com", queued!.To);
    }

    [Fact]
    public async Task AFullQueue_DropsTheMessage_WithoutThrowing()
    {
        var queue = Channel.CreateBounded<EmailMessage>(1);
        var sender = new QueuedEmailSender(queue, NullLogger<QueuedEmailSender>.Instance);

        await sender.SendAsync(Message);
        var error = await Record.ExceptionAsync(() => sender.SendAsync(Message));

        Assert.Null(error);
    }

    [Fact]
    public async Task TheDispatcher_RetriesOnce_ThenGivesUp_WithoutThrowing()
    {
        var transport = Substitute.For<IEmailTransport>();
        transport.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromException(new EmailDeliveryException(503)));
        var logger = new ListLogger<EmailDispatchService>();
        var service = new EmailDispatchService(NewQueue(), transport, logger, TimeSpan.Zero);

        var error = await Record.ExceptionAsync(() => service.DeliverAsync(Message, CancellationToken.None));

        Assert.Null(error);
        await transport.Received(2).SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>());
        Assert.All(logger.Lines, l => Assert.DoesNotContain("alice@example.com", l));
        Assert.Contains(logger.Lines, l => l.Contains("503"));
    }

    [Fact]
    public async Task TheDispatcher_SucceedsOnTheRetry()
    {
        var transport = Substitute.For<IEmailTransport>();
        var calls = 0;
        transport.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>())
            .Returns(_ => ++calls == 1 ? Task.FromException(new HttpRequestException("boom to alice@example.com")) : Task.CompletedTask);
        var logger = new ListLogger<EmailDispatchService>();
        var service = new EmailDispatchService(NewQueue(), transport, logger, TimeSpan.Zero);

        await service.DeliverAsync(Message, CancellationToken.None);

        Assert.Equal(2, calls);
        Assert.All(logger.Lines, l => Assert.DoesNotContain("alice@example.com", l)); // exception text is never logged
    }

    [Fact]
    public async Task TheBackgroundService_DeliversWhatIsQueued()
    {
        var queue = NewQueue();
        var transport = Substitute.For<IEmailTransport>();
        var delivered = new TaskCompletionSource();
        transport.SendAsync(Arg.Any<EmailMessage>(), Arg.Any<CancellationToken>()).Returns(_ =>
        {
            delivered.TrySetResult();
            return Task.CompletedTask;
        });
        using var service = new EmailDispatchService(queue, transport, NullLogger<EmailDispatchService>.Instance, TimeSpan.Zero);
        await service.StartAsync(CancellationToken.None);

        await new QueuedEmailSender(queue, NullLogger<QueuedEmailSender>.Instance).SendAsync(Message);

        await delivered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await service.StopAsync(CancellationToken.None);
    }
}

public class EmailRequestThrottleTests
{
    [Fact]
    public void ThreeInFifteenMinutes_ThenRefused_ThenAllowedAgainAfterTheWindow()
    {
        var now = new DateTime(2026, 10, 11, 12, 0, 0, DateTimeKind.Utc);
        var throttle = new EmailRequestThrottle(() => now);

        Assert.True(throttle.TryAcquire("Reset:a@b.kz"));
        Assert.True(throttle.TryAcquire("reset:a@b.kz")); // case-insensitive
        Assert.True(throttle.TryAcquire("Reset:a@b.kz"));
        Assert.False(throttle.TryAcquire("Reset:a@b.kz"));
        Assert.True(throttle.TryAcquire("Reset:other@b.kz")); // another address has its own budget

        now += EmailRequestThrottle.Window + TimeSpan.FromSeconds(1);
        Assert.True(throttle.TryAcquire("Reset:a@b.kz"));
    }
}

internal sealed class ListLogger<T> : ILogger<T>
{
    public List<string> Lines { get; } = new();

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        lock (Lines)
        {
            Lines.Add(formatter(state, exception) + (exception is null ? string.Empty : " | " + exception));
        }
    }
}
