CC      ?= cc
CFLAGS  ?= -O2 -Wall -Wextra
LDFLAGS += -shared -fPIC
LDLIBS  += -ldl

TARGET = libglwireframe.so

all: $(TARGET)

$(TARGET): src/wireframe.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $< $(LDLIBS)

clean:
	rm -f $(TARGET)

.PHONY: all clean
