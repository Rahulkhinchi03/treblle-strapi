const {
  sendPayloadToTreblle,
  generateFieldsToMask,
  maskSensitiveValues,
  getRequestDuration,
  generateTrebllePayload,
  getResponsePayload,
} = require('@treblle/utils')
const { version: sdkVersion } = require('../../package.json')

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    const { apiKey, projectId, routesToMonitor, additionalFieldsToMask } =
      strapi.config.get('plugin.treblle')

    const [_, path] = ctx.request.url.split('/')
    if (!routesToMonitor.includes(path)) {
      return next()
    }

    const requestStartTime = process.hrtime()
    let errors = []
    await next()
    const { body, query } = ctx.request
    const requestPayload = { ...body, ...query }
    const fieldsToMask = generateFieldsToMask(additionalFieldsToMask)
    const maskedRequestPayload = maskSensitiveValues(requestPayload, fieldsToMask)
    const protocol = `${ctx.request.protocol.toUpperCase()}/${ctx.request.req.httpVersion}`

    const { payload: maskedResponseBody, error: invalidResponseBodyError } = getResponsePayload(
      ctx.body,
      fieldsToMask
    )

    if (invalidResponseBodyError) {
      errors.push(invalidResponseBodyError)
    }

    const trebllePayload = generateTrebllePayload(
      {
        api_key: apiKey,
        project_id: projectId,
        version: sdkVersion,
        sdk: 'strapi',
      },
      {
        server: {
          protocol,
        },
        request: {
          ip: ctx.request.ip,
          url: `${ctx.request.protocol}://${ctx.request.get('host')}${ctx.request.originalUrl}`,
          user_agent: ctx.request.headers['user-agent'],
          method: ctx.request.method,
          headers: maskSensitiveValues(ctx.request.headers, fieldsToMask),
          body: maskedRequestPayload || null,
        },
        response: {
          headers: maskSensitiveValues(ctx.response.headers, fieldsToMask),
          code: ctx.response.status,
          size: ctx.response.length || null,
          load_time: getRequestDuration(requestStartTime),
          body: maskedResponseBody || null,
        },
        errors,
      }
    )

    try {
      sendPayloadToTreblle(trebllePayload, apiKey)
    } catch (error) {
      console.log(error)
    }
  }
}
