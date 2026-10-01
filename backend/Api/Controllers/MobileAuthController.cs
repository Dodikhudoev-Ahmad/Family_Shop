using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Api.RateLimiting;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;

namespace Api.Controllers;

/// <summary>
/// Аутентификация для нативных мобильных клиентов. Здесь refresh-токен приходит в теле JSON (у приложения нет
/// cookie-хранилища браузера) и привязан к устройству. Этот контроллер никогда не читает и не ставит cookie, а
/// тип клиента определяется самим маршрутом и сохранённым типом токена, а не заголовком от клиента — поэтому
/// веб-клиент не может «притвориться мобильным», а cookie-токен не подходит к этим эндпоинтам (и наоборот).
/// Лимиты те же, что и у веб-авторизации (по IP), без обходных путей через заголовки.
/// </summary>
[ApiController]
[Route("api/v1/auth/mobile")]
[EnableRateLimiting(RateLimitPolicies.Auth)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class MobileAuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public MobileAuthController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Регистрация с устройства: возвращает access-токен (15 мин) и refresh-токен (7 дней, с ротацией).</summary>
    [AllowAnonymous]
    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.AuthRegister)]
    public async Task<ActionResult<ApiResponse<MobileAuthResponseDto>>> Register(MobileRegisterRequestDto request, CancellationToken cancellationToken)
    {
        var session = new SessionContext(ClientType.Mobile, request.DeviceId, request.DeviceName);
        var result = await _authService.RegisterAsync(new RegisterRequestDto(request.Email, request.Password, request.Name), session, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<MobileAuthResponseDto>.Ok(ToResponse(result.Value!)))
            : Conflict(ApiResponse<MobileAuthResponseDto>.Fail(result.Errors));
    }

    /// <summary>Вход с устройства. Повторный вход с того же устройства заменяет прежнюю сессию.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<MobileAuthResponseDto>>> Login(MobileLoginRequestDto request, CancellationToken cancellationToken)
    {
        var session = new SessionContext(ClientType.Mobile, request.DeviceId, request.DeviceName);
        var result = await _authService.LoginAsync(new LoginRequestDto(request.Email, request.Password), session, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<MobileAuthResponseDto>.Ok(ToResponse(result.Value!)))
            : Unauthorized(ApiResponse<MobileAuthResponseDto>.Fail(result.Errors));
    }

    /// <summary>
    /// Обмен refresh-токена на новую пару. Старый токен перестаёт действовать сразу; повторное предъявление
    /// старого токена или токен с другого устройства отзывает всю сессию.
    /// </summary>
    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.AuthRefresh)]
    public async Task<ActionResult<ApiResponse<MobileAuthResponseDto>>> Refresh(MobileRefreshRequestDto request, CancellationToken cancellationToken)
    {
        var session = new SessionContext(ClientType.Mobile, request.DeviceId);
        var result = await _authService.RefreshAsync(request.RefreshToken, session, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<MobileAuthResponseDto>.Ok(ToResponse(result.Value!)))
            : Unauthorized(ApiResponse<MobileAuthResponseDto>.Fail(result.Errors));
    }

    /// <summary>Выход на этом устройстве. Всегда 204: ответ не говорит, был ли токен настоящим.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(MobileLogoutRequestDto request, CancellationToken cancellationToken)
    {
        var session = new SessionContext(ClientType.Mobile, request.DeviceId);
        await _authService.RevokeRefreshTokenAsync(request.RefreshToken, session, cancellationToken);
        return NoContent();
    }

    private static MobileAuthResponseDto ToResponse(AuthResult result) => new(
        result.Response.UserId,
        result.Response.Email,
        result.Response.Name,
        result.Response.Role,
        result.Response.AccessToken,
        result.AccessTokenLifetimeSeconds,
        result.RefreshToken,
        result.RefreshTokenExpiresAt);
}
