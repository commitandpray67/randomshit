/*
 * glwireframe — force wireframe rendering in OpenGL applications.
 *
 * AMD's Mesa drivers (radeonsi) have no driver-level wireframe switch,
 * so this shim is injected with LD_PRELOAD and sets
 * glPolygonMode(GL_FRONT_AND_BACK, GL_LINE) before every draw call.
 *
 * Controls:
 *   WIREFRAME=0        start with wireframe disabled (default: enabled)
 *   kill -USR1 <pid>   toggle wireframe at runtime
 */

#define _GNU_SOURCE
#include <dlfcn.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef unsigned int  GLenum;
typedef unsigned int  GLuint;
typedef int           GLint;
typedef int           GLsizei;
typedef unsigned char GLubyte;

#define GL_FRONT_AND_BACK 0x0408
#define GL_LINE           0x1B01
#define GL_FILL           0x1B02

static volatile sig_atomic_t wireframe_on = 1;
static GLenum app_polygon_mode = GL_FILL; /* last mode the app itself asked for */

static void *libgl_handle;

typedef void (*genericfn)(void);

/* Resolve a real GL/GLX symbol, bypassing our own exports. */
static void *lookup(const char *name)
{
    void *p = dlsym(RTLD_NEXT, name);
    if (!p) {
        if (!libgl_handle)
            libgl_handle = dlopen("libGL.so.1", RTLD_LAZY | RTLD_LOCAL);
        if (libgl_handle)
            p = dlsym(libgl_handle, name);
    }
    if (!p) {
        typedef genericfn (*gpa_fn)(const GLubyte *);
        static gpa_fn real_gpa;
        if (!real_gpa) {
            real_gpa = (gpa_fn)dlsym(RTLD_NEXT, "glXGetProcAddressARB");
            if (!real_gpa && libgl_handle)
                real_gpa = (gpa_fn)dlsym(libgl_handle, "glXGetProcAddressARB");
        }
        if (real_gpa)
            p = (void *)real_gpa((const GLubyte *)name);
    }
    return p;
}

typedef void (*pfn_glPolygonMode)(GLenum, GLenum);
static pfn_glPolygonMode real_glPolygonMode;

static void apply_mode(void)
{
    if (!real_glPolygonMode)
        real_glPolygonMode = (pfn_glPolygonMode)lookup("glPolygonMode");
    if (real_glPolygonMode)
        real_glPolygonMode(GL_FRONT_AND_BACK,
                           wireframe_on ? GL_LINE : app_polygon_mode);
}

/* Keep track of the app's own polygon mode so switching wireframe off
 * restores whatever the app wanted, not blindly GL_FILL. */
void glPolygonMode(GLenum face, GLenum mode)
{
    if (!real_glPolygonMode)
        real_glPolygonMode = (pfn_glPolygonMode)lookup("glPolygonMode");
    app_polygon_mode = mode;
    if (real_glPolygonMode)
        real_glPolygonMode(face, wireframe_on ? GL_LINE : mode);
}

#define WRAP(name, PARAMS, ARGS)                                  \
    typedef void (*pfn_##name) PARAMS;                            \
    static pfn_##name real_##name;                                \
    void name PARAMS                                              \
    {                                                             \
        if (!real_##name)                                         \
            real_##name = (pfn_##name)lookup(#name);              \
        if (!real_##name)                                         \
            return;                                               \
        apply_mode();                                             \
        real_##name ARGS;                                         \
    }

WRAP(glDrawArrays,
     (GLenum mode, GLint first, GLsizei count),
     (mode, first, count))
WRAP(glDrawElements,
     (GLenum mode, GLsizei count, GLenum type, const void *indices),
     (mode, count, type, indices))
WRAP(glDrawRangeElements,
     (GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type,
      const void *indices),
     (mode, start, end, count, type, indices))
WRAP(glDrawArraysInstanced,
     (GLenum mode, GLint first, GLsizei count, GLsizei instancecount),
     (mode, first, count, instancecount))
WRAP(glDrawElementsInstanced,
     (GLenum mode, GLsizei count, GLenum type, const void *indices,
      GLsizei instancecount),
     (mode, count, type, indices, instancecount))
WRAP(glDrawElementsBaseVertex,
     (GLenum mode, GLsizei count, GLenum type, const void *indices,
      GLint basevertex),
     (mode, count, type, indices, basevertex))
WRAP(glDrawElementsInstancedBaseVertex,
     (GLenum mode, GLsizei count, GLenum type, const void *indices,
      GLsizei instancecount, GLint basevertex),
     (mode, count, type, indices, instancecount, basevertex))
WRAP(glMultiDrawArrays,
     (GLenum mode, const GLint *first, const GLsizei *count,
      GLsizei drawcount),
     (mode, first, count, drawcount))
WRAP(glMultiDrawElements,
     (GLenum mode, const GLsizei *count, GLenum type,
      const void *const *indices, GLsizei drawcount),
     (mode, count, type, indices, drawcount))
WRAP(glDrawArraysIndirect,
     (GLenum mode, const void *indirect),
     (mode, indirect))
WRAP(glDrawElementsIndirect,
     (GLenum mode, GLenum type, const void *indirect),
     (mode, type, indirect))

/* Apps that fetch entry points through *GetProcAddress must get our
 * wrappers back, otherwise they bypass the shim entirely. */
static const struct {
    const char *name;
    genericfn   fn;
} hook_table[] = {
    { "glPolygonMode",                     (genericfn)glPolygonMode },
    { "glDrawArrays",                      (genericfn)glDrawArrays },
    { "glDrawElements",                    (genericfn)glDrawElements },
    { "glDrawRangeElements",               (genericfn)glDrawRangeElements },
    { "glDrawArraysInstanced",             (genericfn)glDrawArraysInstanced },
    { "glDrawElementsInstanced",           (genericfn)glDrawElementsInstanced },
    { "glDrawElementsBaseVertex",          (genericfn)glDrawElementsBaseVertex },
    { "glDrawElementsInstancedBaseVertex", (genericfn)glDrawElementsInstancedBaseVertex },
    { "glMultiDrawArrays",                 (genericfn)glMultiDrawArrays },
    { "glMultiDrawElements",               (genericfn)glMultiDrawElements },
    { "glDrawArraysIndirect",              (genericfn)glDrawArraysIndirect },
    { "glDrawElementsIndirect",            (genericfn)glDrawElementsIndirect },
};

static genericfn dispatch(const char *name, genericfn real)
{
    if (!real)
        return NULL;
    for (size_t i = 0; i < sizeof(hook_table) / sizeof(hook_table[0]); i++)
        if (strcmp(hook_table[i].name, name) == 0)
            return hook_table[i].fn;
    return real;
}

genericfn glXGetProcAddress(const GLubyte *procName)
{
    typedef genericfn (*pfn)(const GLubyte *);
    static pfn real;
    if (!real)
        real = (pfn)lookup("glXGetProcAddress");
    return dispatch((const char *)procName, real ? real(procName) : NULL);
}

genericfn glXGetProcAddressARB(const GLubyte *procName)
{
    typedef genericfn (*pfn)(const GLubyte *);
    static pfn real;
    if (!real)
        real = (pfn)lookup("glXGetProcAddressARB");
    return dispatch((const char *)procName, real ? real(procName) : NULL);
}

genericfn eglGetProcAddress(const char *procName)
{
    typedef genericfn (*pfn)(const char *);
    static pfn real;
    if (!real) {
        real = (pfn)dlsym(RTLD_NEXT, "eglGetProcAddress");
        if (!real) {
            void *libegl = dlopen("libEGL.so.1", RTLD_LAZY | RTLD_LOCAL);
            if (libegl)
                real = (pfn)dlsym(libegl, "eglGetProcAddress");
        }
    }
    return dispatch(procName, real ? real(procName) : NULL);
}

static void on_sigusr1(int sig)
{
    (void)sig;
    wireframe_on = !wireframe_on;
}

__attribute__((constructor)) static void glwireframe_init(void)
{
    const char *e = getenv("WIREFRAME");
    if (e && (strcmp(e, "0") == 0 || strcmp(e, "off") == 0))
        wireframe_on = 0;

    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = on_sigusr1;
    sa.sa_flags = SA_RESTART;
    sigaction(SIGUSR1, &sa, NULL);

    fprintf(stderr,
            "[glwireframe] loaded, wireframe %s (toggle: kill -USR1 %d)\n",
            wireframe_on ? "ON" : "OFF", (int)getpid());
}
