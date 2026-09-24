using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Проверка промокода без его применения.</summary>
[ApiController]
[Route("api/v1/promo-codes")]
public class PromoCodesController : ControllerBase
{
    private readonly IPromoCodeService _promoCodeService;

    public PromoCodesController(IPromoCodeService promoCodeService)
    {
        _promoCodeService = promoCodeService;
    }

    /// <summary>Предпросмотр скидки по промокоду для указанной суммы заказа.</summary>
    [HttpPost("validate")]
    [EnableRateLimiting("promo-validate")]
    public async Task<ActionResult<ApiResponse<PromoCodeApplicationDto>>> Validate(ValidatePromoCodeRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _promoCodeService.ValidateAndApplyAsync(request.Code, request.OrderSubtotal, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<PromoCodeApplicationDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<PromoCodeApplicationDto>.Fail(result.Errors));
    }
}
