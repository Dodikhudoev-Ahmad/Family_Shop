using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Application.Interfaces;

namespace Infrastructure.Mail;

/// <summary>Actually delivers a message (a provider's API). Kept apart from <see cref="IEmailSender"/>, which only queues.</summary>
public interface IEmailTransport
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}

/// <summary>Resend HTTP API. Failures surface as exceptions to the dispatcher, which logs the status code only.</summary>
public sealed class ResendEmailTransport : IEmailTransport
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    private readonly HttpClient _http;
    private readonly EmailSettings _settings;

    public ResendEmailTransport(HttpClient http, EmailSettings settings)
    {
        _http = http;
        _settings = settings;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, _settings.ApiUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
        // A buffered body (with Content-Length), not streamed JsonContent: plain HTTP servers and proxies in front of a
        // provider read it without chunked-encoding support.
        request.Content = new StringContent(
            JsonSerializer.Serialize(new
            {
                from = _settings.From,
                to = new[] { message.To },
                subject = message.Subject,
                html = message.HtmlBody,
                text = message.TextBody
            }),
            Encoding.UTF8,
            "application/json");

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(Timeout);
        using var response = await _http.SendAsync(request, timeout.Token);

        if (!response.IsSuccessStatusCode)
        {
            // Only the status: the provider's body can echo the recipient address.
            throw new EmailDeliveryException((int)response.StatusCode);
        }
    }
}

public sealed class EmailDeliveryException : Exception
{
    public EmailDeliveryException(int statusCode) : base($"The e-mail provider answered HTTP {statusCode}.")
    {
        StatusCode = statusCode;
    }

    public int StatusCode { get; }
}

/// <summary>Used when no key is configured: nothing leaves the server, and the log says why (without addresses or links).</summary>
public sealed class DisabledEmailTransport : IEmailTransport
{
    private readonly ILogger<DisabledEmailTransport> _logger;

    public DisabledEmailTransport(ILogger<DisabledEmailTransport> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        _logger.LogWarning("E-mail sending is disabled (Email__ApiKey is not set): a message was not sent.");
        return Task.CompletedTask;
    }
}

/// <summary>
/// The <see cref="IEmailSender"/> the application uses: puts the message in a bounded in-memory queue and returns at once, so the
/// request never waits for the provider (and the time it takes does not depend on delivery). <see cref="EmailDispatchService"/>
/// delivers from the queue. A full queue drops the message - the user can ask again.
/// </summary>
public sealed class QueuedEmailSender : IEmailSender
{
    private readonly Channel<EmailMessage> _queue;
    private readonly ILogger<QueuedEmailSender> _logger;

    public QueuedEmailSender(Channel<EmailMessage> queue, ILogger<QueuedEmailSender> logger)
    {
        _queue = queue;
        _logger = logger;
    }

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (!_queue.Writer.TryWrite(message))
        {
            _logger.LogWarning("The e-mail queue is full: a message was dropped.");
        }

        return Task.CompletedTask;
    }
}

public sealed class EmailDispatchService : BackgroundService
{
    public static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(3);

    private readonly Channel<EmailMessage> _queue;
    private readonly IEmailTransport _transport;
    private readonly ILogger<EmailDispatchService> _logger;
    private readonly TimeSpan _retryDelay;

    public EmailDispatchService(Channel<EmailMessage> queue, IEmailTransport transport, ILogger<EmailDispatchService> logger)
        : this(queue, transport, logger, RetryDelay)
    {
    }

    public EmailDispatchService(Channel<EmailMessage> queue, IEmailTransport transport, ILogger<EmailDispatchService> logger, TimeSpan retryDelay)
    {
        _queue = queue;
        _transport = transport;
        _logger = logger;
        _retryDelay = retryDelay;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var message in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await DeliverAsync(message, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
    }

    /// <summary>One try and one retry. Never throws: a broken provider must not stop the queue or the API.</summary>
    public async Task DeliverAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            try
            {
                await _transport.SendAsync(message, cancellationToken);
                return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (EmailDeliveryException ex)
            {
                _logger.LogWarning("E-mail delivery failed (attempt {Attempt}): provider status {Status}.", attempt, ex.StatusCode);
            }
            catch (Exception ex)
            {
                // Types and the transport-level error kind only: the message can carry the request URL or an address.
                var kind = ex is HttpRequestException http ? http.HttpRequestError.ToString() : ex.InnerException?.GetType().Name;
                _logger.LogWarning("E-mail delivery failed (attempt {Attempt}): {ErrorType} {ErrorKind}.", attempt, ex.GetType().Name, kind);
            }

            if (attempt == 1)
            {
                try
                {
                    await Task.Delay(_retryDelay, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }
    }
}
