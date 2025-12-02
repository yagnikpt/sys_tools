package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"

	"github.com/godbus/dbus/v5"
)

const (
	busName     = "xyz.FocusMode"
	objectPath  = "/xyz/FocusMode"
	iface       = "xyz.FocusMode1"
	stateFile   = "/run/focusmode.state"
)

func isActive() bool {
	data, err := ioutil.ReadFile(stateFile)
	if err != nil {
		return false
	}
	return string(data) == "active"
}

func setState(active bool) {
	val := []byte("inactive")
	if active {
		val = []byte("active")
	}
	os.MkdirAll("/run", 0755)
	ioutil.WriteFile(stateFile, val, 0644)
}

func runScript(path string) error {
	cmd := exec.Command(path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

type FocusMode struct{}

func (f *FocusMode) Enable() *dbus.Error {
	if err := runScript("/usr/local/sbin/focus-on"); err != nil {
		return dbus.MakeFailedError(err)
	}
	setState(true)
	return nil
}

func (f *FocusMode) Disable() *dbus.Error {
	if err := runScript("/usr/local/sbin/focus-off"); err != nil {
		return dbus.MakeFailedError(err)
	}
	setState(false)
	return nil
}

func (f *FocusMode) Toggle() *dbus.Error {
	if isActive() {
		return f.Disable()
	}
	return f.Enable()
}

func (f *FocusMode) Status() (string, *dbus.Error) {
	if isActive() {
		return "active", nil
	}
	return "inactive", nil
}

func main() {
	conn, err := dbus.ConnectSystemBus()
	if err != nil {
		fmt.Println("Cannot connect to system bus:", err)
		os.Exit(1)
	}
	defer conn.Close()

	reply, err := conn.RequestName(busName,
		dbus.NameFlagDoNotQueue)
	if err != nil || reply != dbus.RequestNameReplyPrimaryOwner {
		fmt.Println("Name already taken or cannot acquire:", err)
		os.Exit(1)
	}

	focus := &FocusMode{}
	conn.Export(focus, objectPath, iface)

	fmt.Println("Focus Mode DBus service running...")

	select {} // block forever
}
