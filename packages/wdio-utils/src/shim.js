import logger from '@wdio/logger'

const log = logger('@wdio/utils:shim')

let inCommandHook = false

let executeHooksWithArgs = async function executeHooksWithArgsShim (hooks, args) {
    /**
     * make sure hooks are an array of functions
     */
    if (!Array.isArray(hooks)) {
        hooks = [hooks]
    }

    /**
     * make sure args is an array since we are calling apply
     */
    if (!Array.isArray(args)) {
        args = [args]
    }

    hooks = hooks.map((hook) => new Promise((resolve) => {
        let result

        try {
            result = hook.apply(null, args)
        } catch (e) {
            log.error(e.stack)
            return resolve(e)
        }

        /**
         * if a promise is returned make sure we don't have a catch handler
         * so in case of a rejection it won't cause the hook to fail
         */
        if (result && typeof result.then === 'function') {
            return result.then(resolve, (e) => {
                log.error(e.stack)
                resolve(e)
            })
        }

        resolve(result)
    }))

    return Promise.all(hooks)
}

function wrapCommandFactory (syncWrapper) {
    return function wrapCommand (commandName, fn) {
        async function wrapCommandFn (...args) {
            const beforeHookArgs = [commandName, args]
            if (!inCommandHook && this.options.beforeCommand) {
                inCommandHook = true
                await executeHooksWithArgs.call(this, this.options.beforeCommand, beforeHookArgs)
                inCommandHook = false
            }

            let commandResult
            let commandError
            try {
                commandResult = await fn.apply(this, args)
            } catch (err) {
                commandError = err
            }

            if (!inCommandHook && this.options.afterCommand) {
                inCommandHook = true
                const afterHookArgs = [...beforeHookArgs, commandResult, commandError]
                await executeHooksWithArgs.call(this, this.options.afterCommand, afterHookArgs)
                inCommandHook = false
            }

            if (commandError) {
                throw commandError
            }

            return commandResult
        }

        if (typeof syncWrapper !== 'function') {
            return wrapCommandFn
        }

        return function callFn (...args) {
            return syncWrapper(wrapCommandFn.call(this, ...args))
        }
    }
}

let waitForPromise = null

/**
 * shim to make sure that we only wrap commands if wdio-sync is installed as dependency
 */
try {
    /**
     * only require `@wdio/sync` if `WDIO_NO_SYNC_SUPPORT` which allows us to
     * create a smoke test scenario to test actual absence of the package
     * (internal use only)
     */
    /* istanbul ignore if */
    if (!process.env.WDIO_NO_SYNC_SUPPORT) {
        // eslint-disable-next-line import/no-unresolved
        waitForPromise = require('@wdio/sync').default
    }
} catch {
    // do nothing
}

const wrapCommand = wrapCommandFactory(waitForPromise)

export {
    executeHooksWithArgs,
    wrapCommand
}
