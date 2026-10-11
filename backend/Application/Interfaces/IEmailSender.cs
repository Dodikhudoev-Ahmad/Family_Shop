namespace Application.Interfaces;

/// <summary>One outgoing message. <see cref="HtmlBody"/> is self-contained (inline styles, no remote images or trackers);
/// <see cref="TextBody"/> is the same content as plain text.</summary>
public sealed record EmailMessage(string To, string Subject, string HtmlBody, string TextBody)
{
    // The body holds a one-time link: it must never end up in a log through ToString().
    public override string ToString() => $"EmailMessage {{ Subject = {Subject} }}";
}

/// <summary>
/// Sends an e-mail. The implementation is swappable (Resend today, see Infrastructure); callers treat a failure as non-fatal and
/// never tell the client about it - a message that could not be sent is simply requested again with the "resend" button.
/// </summary>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}
