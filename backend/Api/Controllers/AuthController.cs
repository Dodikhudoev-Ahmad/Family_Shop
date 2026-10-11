using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Api.Security;
using Api.Filters;
using Api.RateLimiting;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Регистрация, вход и обновление токенов для браузера (refresh-токен — в httpOnly cookie).</summary>
[ApiController]
[Route("api/v1/auth")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class AuthController : ControllerBase
{
    private const string RefreshTokenCookie = "refreshToken";
    private readonly IAuthService _authService;
    private readonly IAccountEmailService _accountEmails;
    private readonly RefreshCookiePolicy _cookiePolicy;

    public AuthController(IAuthService authService, IAccountEmailService accountEmails, RefreshCookiePolicy cookiePolicy)
    {
        _authService = authService;
        _accountEmails = accountEmails;
        _cookiePolicy = cookiePolicy;
    }

    /// <summary>Регистрация нового пользователя.</summary>
    [AllowAnonymous]
    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.AuthRegister)]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Register(RegisterRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.RegisterAsync(request, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            if (result.ErrorCode == ResultErrorCodes.BreachedPassword)
            {
                return BadRequest(ApiResponse<AuthResponseDto>.Fail(result.Errors, ResultErrorCodes.BreachedPassword, null));
            }

            return Conflict(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Вход по email и паролю.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Обновление access-токена по refresh-токену из httpOnly cookie (с ротацией). Требует заголовок X-Requested-With: fetch и допустимый Origin (защита от CSRF).</summary>
    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.AuthRefresh)]
    [ServiceFilter(typeof(CookieCsrfFilter))]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) || string.IsNullOrEmpty(refreshToken))
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail("Refresh token missing."));
        }

        var result = await _authService.RefreshAsync(refreshToken, SessionContext.Web, cancellationToken);
        if (!result.IsSuccess)
        {
            Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken, result.Value.RefreshTokenExpiresAt);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Выход из аккаунта на этом устройстве — сессия (вся цепочка refresh-токенов) отзывается. Требует X-Requested-With: fetch и допустимый Origin.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    [ServiceFilter(typeof(CookieCsrfFilter))]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) && !string.IsNullOrEmpty(refreshToken))
        {
            await _authService.RevokeRefreshTokenAsync(refreshToken, SessionContext.Web, cancellationToken);
        }

        Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
        return NoContent();
    }

    // The three session-management calls below (logout-all, sessions, revoke) deliberately carry NO named
    // rate-limit policy: they need a valid access token already, so credential brute-forcing is not a
    // concern, and the strict login budget (10/min per IP) would only get in the way of a signed-in user.
    // They are still covered by the global 100/min per IP.

    /// <summary>«Выйти со всех устройств»: отзывает все сессии пользователя — веб и мобильные.</summary>
    [Authorize]
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll(CancellationToken cancellationToken)
    {
        await _authService.LogoutAllAsync(GetUserId(), cancellationToken);
        Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
        return NoContent();
    }

    /// <summary>Активные сессии (устройства) текущего пользователя.</summary>
    [Authorize]
    [HttpGet("sessions")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<SessionDto>>>> GetSessions(CancellationToken cancellationToken)
    {
        var sessions = await _authService.GetSessionsAsync(GetUserId(), GetSessionId(), cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<SessionDto>>.Ok(sessions));
    }

    /// <summary>Выйти на конкретном устройстве. Чужой идентификатор сессии даёт 404, как будто её нет.</summary>
    [Authorize]
    [HttpDelete("sessions/{sessionId:guid}")]
    public async Task<IActionResult> RevokeSession(Guid sessionId, CancellationToken cancellationToken)
    {
        var result = await _authService.RevokeSessionAsync(GetUserId(), sessionId, cancellationToken);
        return result.IsSuccess ? NoContent() : NotFound(ApiResponse<bool>.Fail(result.Errors));
    }

    /// <summary>
    /// Удаление собственного аккаунта (App Store 5.1.1(v)). Нужен текущий пароль; под строгим лимитом входа (10/мин на IP) —
    /// чужой украденный access-токен не должен позволять подбирать пароль. Идентификатор берётся только из токена,
    /// поэтому удалить можно лишь свой аккаунт. Все сессии завершаются, персональные данные стираются, заказы и отзывы остаются.
    /// Неверный пароль — 400 (не 401: иначе клиент решит, что сессия умерла); аккаунт администратора — 403; есть активный заказ (не «доставлен»/«отменён») — 409 `active_orders`, проверяется только после пароля.
    /// </summary>
    [Authorize]
    [HttpDelete("me")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> DeleteAccount(DeleteAccountRequestDto request, CancellationToken cancellationToken)
    {
        var outcome = await _authService.DeleteAccountAsync(GetUserId(), request.Password, cancellationToken);
        switch (outcome)
        {
            case DeleteAccountOutcome.Deleted:
                Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
                return NoContent();
            case DeleteAccountOutcome.InvalidPassword:
                return BadRequest(ApiResponse<bool>.Fail("Incorrect password."));
            case DeleteAccountOutcome.ActiveOrders:
                return Conflict(ApiResponse<bool>.Fail("active_orders"));
            case DeleteAccountOutcome.NotAllowed:
                return StatusCode(StatusCodes.Status403Forbidden, ApiResponse<bool>.Fail("This account cannot be deleted from the app."));
            default:
                return NotFound(ApiResponse<bool>.Fail("Account not found."));
        }
    }

    /// <summary>
    /// Смена собственного пароля. Нужен текущий пароль; под строгим лимитом входа (10/мин на IP) и общей паузой аккаунта после
    /// повторных неверных паролей. После смены все сессии (веб и мобильные) завершаются — нужно войти заново с новым паролем.
    /// Неверный текущий пароль — 400 (не 401: иначе клиент решит, что сессия умерла); новый пароль совпадает с email — 400.
    /// </summary>
    [Authorize]
    [HttpPost("change-password")]
    [EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequestDto request, CancellationToken cancellationToken)
    {
        var outcome = await _authService.ChangePasswordAsync(GetUserId(), request.CurrentPassword, request.NewPassword, cancellationToken);
        switch (outcome)
        {
            case ChangePasswordOutcome.Changed:
                Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
                return NoContent();
            case ChangePasswordOutcome.InvalidPassword:
                return BadRequest(ApiResponse<bool>.Fail("Incorrect password."));
            case ChangePasswordOutcome.BreachedPassword:
                return BadRequest(ApiResponse<bool>.Fail(
                    new[] { "This password has appeared in a data breach - choose another one." }, ResultErrorCodes.BreachedPassword, null));
            case ChangePasswordOutcome.NotAllowed:
                return BadRequest(ApiResponse<bool>.Fail("Password must not be the same as the e-mail address."));
            default:
                return NotFound(ApiResponse<bool>.Fail("Account not found."));
        }
    }

    // ---- E-mail confirmation and password reset. No session is involved (the link is opened in any browser), so the same
    // four endpoints serve the site and the mobile app. They carry no cookies, hence no CSRF filter. ----

    /// <summary>Подтверждение email по токену из письма. Токен одноразовый (24 ч); неверный, использованный и просроченный дают один и тот же ответ 400 `invalid_token`.</summary>
    [AllowAnonymous]
    [HttpPost("email/confirm")]
    [EnableRateLimiting(RateLimitPolicies.AuthEmailLink)]
    public async Task<IActionResult> ConfirmEmail(ConfirmEmailRequestDto request, CancellationToken cancellationToken)
    {
        var outcome = await _accountEmails.ConfirmEmailAsync(request.Token, cancellationToken);
        return outcome == ConfirmEmailOutcome.Confirmed
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(InvalidTokenResponse());
    }

    /// <summary>Отправить письмо с подтверждением ещё раз. Ответ всегда 200 и не зависит от того, есть ли такой email, подтверждён ли он и ушло ли письмо.</summary>
    [AllowAnonymous]
    [HttpPost("email/resend")]
    [EnableRateLimiting(RateLimitPolicies.AuthEmail)]
    public async Task<IActionResult> ResendConfirmation(ResendConfirmationRequestDto request, CancellationToken cancellationToken)
    {
        await _accountEmails.RequestConfirmationAsync(request.Email, request.Locale, cancellationToken);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    /// <summary>«Забыли пароль»: письмо со ссылкой (30 мин, один раз). Ответ всегда 200 и не различает известный и неизвестный email.</summary>
    [AllowAnonymous]
    [HttpPost("password/forgot")]
    [EnableRateLimiting(RateLimitPolicies.AuthEmail)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequestDto request, CancellationToken cancellationToken)
    {
        await _accountEmails.RequestPasswordResetAsync(request.Email, request.Locale, cancellationToken);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    /// <summary>
    /// Новый пароль по токену из письма. Политика пароля как при регистрации; хеш, использование токена и отзыв всех сессий
    /// (веб и мобильные) — в одной транзакции. После этого нужно войти заново. Неверный/просроченный токен — 400 `invalid_token`;
    /// пароль совпадает с email — 400 `password_is_email`, утёкший пароль — 400 `breached_password` (токен при этом не гасится).
    /// </summary>
    [AllowAnonymous]
    [HttpPost("password/reset")]
    [EnableRateLimiting(RateLimitPolicies.AuthEmailLink)]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequestDto request, CancellationToken cancellationToken)
    {
        var outcome = await _accountEmails.ResetPasswordAsync(request.Token, request.NewPassword, cancellationToken);
        switch (outcome)
        {
            case ResetPasswordOutcome.Reset:
                // A stale cookie of this browser would only be refused at its next refresh; drop it now.
                Response.Cookies.Delete(RefreshTokenCookie, BuildCookieOptions(null));
                return Ok(ApiResponse<bool>.Ok(true));
            case ResetPasswordOutcome.NotAllowed:
                return BadRequest(ApiResponse<bool>.Fail(
                    new[] { "Password must not be the same as the e-mail address." }, "password_is_email", null));
            case ResetPasswordOutcome.BreachedPassword:
                return BadRequest(ApiResponse<bool>.Fail(
                    new[] { "This password has appeared in a data breach - choose another one." }, ResultErrorCodes.BreachedPassword, null));
            default:
                return BadRequest(InvalidTokenResponse());
        }
    }

    private static ApiResponse<bool> InvalidTokenResponse() =>
        ApiResponse<bool>.Fail(new[] { "The link is invalid or has expired." }, "invalid_token", null);

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Guid? GetSessionId()
    {
        var raw = User.FindFirstValue("sid") ?? User.FindFirstValue(ClaimTypes.Sid);
        return Guid.TryParse(raw, out var id) ? id : null;
    }

    private void SetRefreshTokenCookie(string refreshToken, DateTime expiresAtUtc)
    {
        Response.Cookies.Append(RefreshTokenCookie, refreshToken, BuildCookieOptions(new DateTimeOffset(DateTime.SpecifyKind(expiresAtUtc, DateTimeKind.Utc))));
    }

    // Domain / SameSite / Secure depend on where the API is reached (see RefreshCookiePolicy). Delete() must use the same
    // attributes as Append(), or the browser ignores it.
    private CookieOptions BuildCookieOptions(DateTimeOffset? expires) => _cookiePolicy.Build(Request, expires);
}
